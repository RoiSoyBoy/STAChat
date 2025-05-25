import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware'; // Import the interface

// Extend AuthenticatedRequest to explicitly include tenantId at the root for convenience
export interface TenantAwareRequest extends AuthenticatedRequest {
  tenantId?: string; 
}

export const tenantContextMiddleware = (req: TenantAwareRequest, res: Response, next: NextFunction) => {
  // Development bypass for tenantId
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_FIREBASE_AUTH === 'true') {
    const devTenantId = process.env.DEV_TENANT_ID || 'default-dev-tenant';
    req.tenantId = devTenantId;
    console.log(`[tenantContextMiddleware] DEV MODE: Bypassing tenant ID extraction. Using tenantId: ${devTenantId}`);
    
    // Also ensure req.user.tenantId is populated if other parts expect it from there,
    // though TenantAwareRequest makes req.tenantId primary.
    if (req.user) {
      // @ts-ignore
      req.user.tenantId = devTenantId;
    } else {
      // @ts-ignore
      req.user = { tenantId: devTenantId };
    }
    return next();
  }

  // Standard logic: try to get tenantId from the user object (populated by auth middleware from token claims)
  if (req.user && req.user.tenantId) {
    req.tenantId = req.user.tenantId; // Make tenantId directly accessible on the request
    next();
  } else {
    console.warn('[tenantContextMiddleware] Tenant ID missing in user token/claims for a tenant-aware route.');
    // It's important that the auth middleware (firebaseAuthMiddleware or verifyTokenMiddleware)
    // populates req.user.tenantId if it's expected from the token.
    // If firebaseAuthMiddleware is used, it currently does not add tenantId to req.user from Firebase token claims.
    // This might need to be added there if Firebase tokens contain a custom claim for tenantId.
    return res.status(403).json({ error: 'Forbidden: Tenant information missing or user not associated with a tenant.' });
  }
};

// Optional: A more lenient version if some routes don't strictly need tenantId
export const optionalTenantContextMiddleware = (req: TenantAwareRequest, res: Response, next: NextFunction) => {
  if (req.user && req.user.tenantId) {
    req.tenantId = req.user.tenantId;
  }
  next(); // Always proceed, tenantId is optional here
};
