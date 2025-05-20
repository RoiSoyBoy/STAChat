import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string; // Or uid, depending on your Firebase setup
    email?: string;
    tenantId?: string; // Will be populated if present in JWT
    // Add other relevant user properties from JWT
  };
}

export const verifyTokenMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not defined. Authentication will fail.');
    return res.status(500).json({ error: 'Internal server error: JWT secret missing' });
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7, authHeader.length); // Extract token from "Bearer <token>"
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ error: 'Unauthorized: Token expired' });
        }
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }

      // Assuming the decoded token has user information including id and potentially tenantId
      // Adjust the structure based on your actual JWT payload
      req.user = decoded as AuthenticatedRequest['user'];
      next();
    });
  } else {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
};
