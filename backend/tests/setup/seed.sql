-- Seed admin user for tests
INSERT INTO "User" (email, password, name, role, "createdAt", "updatedAt")
VALUES (
  'admin@fakturace.cz',
  '$2a$10$rKj0qD4vQ8xK5n0yH3u9.OZGzV7ZQxVQYJ1X5X1Y3Z4A5B6C7D8E9F',
  'Administrator',
  'ADMIN',
  NOW(),
  NOW()
);
