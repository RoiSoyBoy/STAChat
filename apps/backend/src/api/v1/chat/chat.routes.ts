import { Router } from 'express';
import { verifyTokenMiddleware } from '../../../middleware/auth.middleware';
import { tenantContextMiddleware, TenantAwareRequest } from '../../../middleware/tenantContext.middleware';
// We will create this controller next
import { handleChatRequest } from './chat.controller'; 

const router = Router();

// POST /api/v1/chat
// This route is protected and requires a valid JWT.
// It also uses the tenantContextMiddleware to ensure tenantId is available.
router.post(
  '/',
  verifyTokenMiddleware,    // First, verify the token and populate req.user
  tenantContextMiddleware,  // Then, extract tenantId and populate req.tenantId
  handleChatRequest        // Finally, pass to the controller
);

export default router;
