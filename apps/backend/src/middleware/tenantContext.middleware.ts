import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware'; // Import the interface

// Extend AuthenticatedRequest to explicitly include tenantId at the root for convenience
export interface TenantAwareRequest extends AuthenticatedRequest {
  tenantId?: string; 
}

export const tenantContextMiddleware = (req: TenantAwareRequest, res: Response, next: NextFunction) => {
  if (req.user && req.user.tenantId) {
    req.tenantId = req.user.tenantId; // Make tenantId directly accessible on the request
    next();
  } else {
    // This path implies that the route requires tenant context, but it wasn't found.
    // The JWT might be valid but not contain tenantId, or the user object might be missing.
    // For routes that strictly require a tenantId, this check is crucial.
    // For routes that might operate without a tenantId (e.g. global admin routes), 
    // this middleware might be applied selectively or made more lenient.
    console.warn('Tenant ID missing in token for a tenant-aware route.');
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
