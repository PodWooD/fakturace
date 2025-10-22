#!/usr/bin/env python3
"""
Automated smoke test of Fakturace frontend via BrowserMCP HTTP server.

The script talks to BrowserMCP over the HTTP transport (JSON-RPC over SSE),
drives the UI, captures snapshots, and records simple assertions for each view.

Prerequisites:
  - browsermcp-enhanced running on http://127.0.0.1:5555/mcp
  - Fakturace frontend available on http://127.0.0.1:3030
  - Test account admin@fakturace.cz / admin123
"""

from __future__ import annotations

import base64
import json
import os
import pathlib
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import requests


MCP_URL = os.environ.get("MCP_URL", "http://127.0.0.1:5555/mcp")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:3030")
RESULTS_DIR = pathlib.Path(os.environ.get("MCP_TEST_RESULTS", "test-results/mcp-smoke"))
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


class MCPError(RuntimeError):
    """Raised when the MCP server returns an error payload."""


def _parse_sse_payloads(raw: bytes) -> Tuple[List[dict], str]:
    """Convert SSE response (bytes) into a list of JSON objects."""
    text = raw.decode("utf-8")
    payloads: List[dict] = []
    buffer: List[str] = []
    for line in text.splitlines():
        if line.startswith("data: "):
            buffer.append(line[6:])
        elif not line.strip():
            if buffer:
                payloads.append(json.loads("\n".join(buffer)))
                buffer = []
    if buffer:
        payloads.append(json.loads("\n".join(buffer)))
    return payloads, text


class MCPClient:
    """Minimal client for BrowserMCP HTTP transport."""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Mcp-Protocol-Version": "2025-03-26",
            }
        )
        self._session_id: Optional[str] = None
        self._msg_id = 0

    def _next_id(self) -> int:
        self._msg_id += 1
        return self._msg_id

    def initialize(self) -> None:
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "mcp-frontend-test", "version": "0.1"},
            },
        }
        events = self._post(payload)
        for evt in events:
            if "result" in evt:
                sid = evt.get("headers", {}).get("mcp-session-id") if isinstance(evt.get("headers"), dict) else None
                if sid:
                    self._session_id = sid
        if not self._session_id:
            # fallback: read from response headers handled in _post
            raise MCPError("Failed to obtain session id during initialize")

    def _post(self, payload: dict) -> List[dict]:
        headers = dict(self.session.headers)
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        resp = self.session.post(self.base_url, headers=headers, data=json.dumps(payload))
        resp.raise_for_status()

        # store session id if present in response
        sid = resp.headers.get("mcp-session-id")
        if sid:
            self._session_id = sid

        events, raw = _parse_sse_payloads(resp.content)
        for evt in events:
            if "error" in evt:
                raise MCPError(json.dumps(evt["error"], ensure_ascii=False))
        return events

    def call_tool(self, name: str, arguments: dict) -> List[dict]:
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        return self._post(payload)

    def wait(self, seconds: float) -> None:
        self.call_tool("browser_wait", {"time": seconds})

    def navigate(self, url: str) -> str:
        events = self.call_tool("browser_navigate", {"action": "goto", "url": url})
        return events[0]["result"]["content"][0]["text"]

    def snapshot(self, level: str = "minimal") -> str:
        events = self.call_tool("browser_snapshot", {"level": level})
        return events[0]["result"]["content"][0]["text"]

    def type_text(
        self,
        element_desc: str,
        text: str,
        ref: Optional[str] = None,
        selector: Optional[str] = None,
    ) -> str:
        if not (ref or selector):
            raise ValueError("Either ref or selector must be provided for type_text")
        arguments = {"element": element_desc, "text": text}
        if ref:
            arguments["ref"] = ref
        if selector:
            arguments["selector"] = selector
        events = self.call_tool("browser_type", arguments)
        return events[0]["result"]["content"][0]["text"]

    def click(
        self,
        element_desc: str,
        ref: Optional[str] = None,
        selector: Optional[str] = None,
    ) -> str:
        if not (ref or selector):
            raise ValueError("Either ref or selector must be provided for click")
        arguments = {"element": element_desc}
        if ref:
            arguments["ref"] = ref
        if selector:
            arguments["selector"] = selector
        events = self.call_tool("browser_click", arguments)
        return events[0]["result"]["content"][0]["text"]

    def screenshot(self, label: str) -> pathlib.Path:
        events = self.call_tool("browser_screenshot", {})
        content = events[0]["result"]["content"]
        image_entry = next((item for item in content if item["type"] == "image"), None)
        if not image_entry:
            raise MCPError("Screenshot response missing image entry")
        data = image_entry["data"]
        mime = image_entry.get("mimeType", "image/png")
        ext = ".png" if mime.endswith("png") else ".jpg"
        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        path = RESULTS_DIR / f"{ts}-{label}{ext}"
        path.write_bytes(base64.b64decode(data))
        return path


def parse_refs(snapshot_text: str) -> Dict[str, List[str]]:
    refs: Dict[str, List[str]] = {}
    for line in snapshot_text.splitlines():
        match = re.search(r"\[ref=(ref\d+)\]", line)
        if not match:
            continue
        ref = match.group(1)
        label_match = re.findall(r'"([^"]+)"', line)
        label = label_match[0] if label_match else line.strip()
        refs.setdefault(label.lower(), []).append(ref)
    return refs


@dataclass
class CheckResult:
    context: str
    action: str
    status: str
    detail: str = ""


class FrontendSmokeTest:
    def __init__(self, mcp: MCPClient):
        self.mcp = mcp
        self.results: List[CheckResult] = []
        self.refs: Dict[str, List[str]] = {}

    def log(self, context: str, action: str, status: str, detail: str = "") -> None:
        print(f"[{status}] {context} – {action} {detail}")
        self.results.append(CheckResult(context, action, status, detail))

    def _snapshot_with_refs(self, level: str = "minimal") -> str:
        snapshot = self.mcp.snapshot(level=level)
        self.refs = parse_refs(snapshot)
        return snapshot

    def _get_ref(self, label: str) -> Optional[str]:
        return (self.refs.get(label.lower()) or [None])[0]

    def _assert_contains(self, context: str, snapshot: str, expected: str) -> None:
        if expected.lower() in snapshot.lower():
            self.log(context, f"contain '{expected}'", "OK")
        else:
            self.log(context, f"contain '{expected}'", "FAIL", "nenalezeno")

    def run(self) -> None:
        self.mcp.initialize()

        # Login
        context = "Přihlášení"
        nav_text = self.mcp.navigate(FRONTEND_URL)
        self.log(context, "Otevření login page", "OK", nav_text.splitlines()[0])
        snapshot = self._snapshot_with_refs()
        email_ref = self._get_ref("email or username") or self._get_ref("email")
        password_ref = self._get_ref("password") or self._get_ref("heslo")
        login_button_ref = self._get_ref("Přihlásit se") or self._get_ref("Log in")

        if not (email_ref and password_ref and login_button_ref):
            self.log(context, "Vyhledání login prvků", "FAIL", str(self.refs))
            return

        self.mcp.type_text(email_ref, "Email input", "admin@fakturace.cz")
        self.mcp.type_text(password_ref, "Password input", "admin123")
        self.mcp.click(login_button_ref, "Přihlásit se")
        self.mcp.wait(2)
        dash_snapshot = self._snapshot_with_refs()
        self._assert_contains(context, dash_snapshot, "AKTIVNÍ ORGANIZACE")
        self._assert_contains(context, dash_snapshot, "ZBÝVÁ VYFAKTUROVAT")
        dash_shot = self.mcp.screenshot("dashboard")
        self.log(context, "Screenshot dashboard", "OK", str(dash_shot))

        # Dashboard navigation items
        nav_labels = [
            ("Dashboard", "Dashboard"),
            ("Organizace", "Organizace"),
            ("Výkazy práce", "work-records"),
            ("Faktury", "invoices"),
            ("Import dat", "import"),
            ("Export", "export"),
            ("Reporty", "reports"),
        ]

        for label, slug in nav_labels:
            context = label
            ref = None
            for key, values in self.refs.items():
                if label.lower() in key:
                    ref = values[0]
                    break
            if not ref:
                self.log(context, "Najít odkaz v navigaci", "FAIL")
                continue
            self.mcp.click(ref, f"Navigace {label}")
            self.mcp.wait(1.5)
            snapshot = self._snapshot_with_refs()
            self._assert_contains(context, snapshot, label)
            if slug == "Organizace":
                self._test_organizations(snapshot)
            page_shot = self.mcp.screenshot(slug.replace("/", "_"))
            self.log(context, "Screenshot", "OK", str(page_shot))

        # Logout
        context = "Odhlášení"
        snapshot = self._snapshot_with_refs()
        logout_ref = self._get_ref("Odhlásit")
        if logout_ref:
            self.mcp.click(logout_ref, "Odhlásit")
            self.mcp.wait(1)
            snapshot = self._snapshot_with_refs()
            self._assert_contains(context, snapshot, "Přihlásit se")
            self.log(context, "Logout úspěšný", "OK")
        else:
            self.log(context, "Nalezení tlačítka Odhlásit", "FAIL")

        self._write_report()

    def _test_organizations(self, snapshot: str) -> None:
        context = "Organizace - CRUD"
        add_ref = self._get_ref("Přidat organizaci") or self._get_ref("+ Nová organizace")
        if not add_ref:
            self.log(context, "Najít tlačítko Přidat organizaci", "FAIL")
            return
        self.mcp.click(add_ref, "Přidat organizaci")
        self.mcp.wait(0.5)
        snapshot = self._snapshot_with_refs(level="scaffold")
        name_ref = (
            self._get_ref("Název organizace")
            or self._get_ref("Název")
            or self._get_ref("Organization Name")
        )
        code_ref = (
            self._get_ref("Kód organizace")
            or self._get_ref("Kód")
            or self._get_ref("Organization Code")
        )
        save_ref = self._get_ref("Uložit")
        if not (name_ref and code_ref and save_ref):
            self.log(context, "Najít pole formuláře", "FAIL", str(self.refs))
            return
        unique_suffix = datetime.utcnow().strftime("%H%M%S")
        name = f"MCP Test Org {unique_suffix}"
        code = f"MCP{unique_suffix}"
        self.mcp.type_text(name_ref, "Pole název organizace", name)
        self.mcp.type_text(code_ref, "Pole kód organizace", code)
        self.mcp.click(save_ref, "Uložit organizaci")
        self.mcp.wait(1.5)
        snapshot = self._snapshot_with_refs()
        if name.lower() in snapshot.lower():
            self.log(context, "Organizace vytvořena", "OK", name)
        else:
            self.log(context, "Organizace vytvořena", "FAIL", "název nebyl nalezen po uložení")

    def _write_report(self) -> None:
        ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        report_lines = [
            f"MCP Frontend Smoke Test – {ts} UTC",
            f"MCP URL: {MCP_URL}",
            f"Frontend URL: {FRONTEND_URL}",
            "",
        ]
        for res in self.results:
            line = f"[{res.status}] {res.context} – {res.action}"
            if res.detail:
                line += f" :: {res.detail}"
            report_lines.append(line)
        report_path = RESULTS_DIR / f"report-{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.txt"
        report_path.write_text("\n".join(report_lines), encoding="utf-8")
        print(f"\nSouhrnný report uložen do {report_path}")


def main() -> int:
    client = MCPClient(MCP_URL)
    test = FrontendSmokeTest(client)
    try:
        test.run()
    except MCPError as exc:
        print(f"MCP error: {exc}", file=sys.stderr)
        return 1
    except requests.RequestException as exc:
        print(f"HTTP error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
