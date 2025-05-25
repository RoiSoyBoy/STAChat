import { Router } from 'express';
// import { verifyTokenMiddleware } from '../../../middleware/auth.middleware'; // Using Firebase auth instead
import { firebaseAuthMiddleware } from '../../../middleware/firebaseAuth.middleware'; // Import Firebase auth middleware
import { tenantContextMiddleware, TenantAwareRequest } from '../../../middleware/tenantContext.middleware';
// We will create this controller next
import { handleChatRequest } from './chat.controller'; 

const router = Router();

// POST /api/v1/chat
// This route is protected and now uses Firebase Authentication (or bypass mode).
// It also uses the tenantContextMiddleware to ensure tenantId is available.
router.post(
  '/',
  firebaseAuthMiddleware, // Use Firebase auth middleware (handles BYPASS_FIREBASE_AUTH)
  tenantContextMiddleware,  // Then, extract tenantId and populate req.tenantId
  handleChatRequest        // Finally, pass to the controller
);

export default router;
