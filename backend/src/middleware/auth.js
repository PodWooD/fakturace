const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // Získání tokenu z hlavičky
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ message: 'Chybí autorizační token' });
    }

    // Token má formát "Bearer <token>"
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Neplatný formát tokenu' });
    }

    // Verifikace tokenu
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Přidání uživatelských dat do požadavku
    req.user = decoded;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token vypršel' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Neplatný token' });
    }
    
    return res.status(500).json({ message: 'Chyba při ověřování tokenu' });
  }
};

module.exports = authMiddleware;