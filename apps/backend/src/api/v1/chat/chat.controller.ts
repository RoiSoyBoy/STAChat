import { Response } from 'express';
import { TenantAwareRequest } from '../../../middleware/tenantContext.middleware';
import { ChatService } from './chat.service';

const chatService = new ChatService();

export const handleChatRequest = async (req: TenantAwareRequest, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(403).json({ error: "Forbidden: Tenant ID is required for chat." });
    }
    
    if (!req.user || !req.user.id) {
      // This should ideally be caught by auth middleware if user ID is mandatory
      return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
    }

    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Bad Request: 'message' is required in the request body." });
    }

    const result = await chatService.processMessage(
      req.tenantId,
      req.user.id,
      message,
      history
    );
    
    res.json(result);

  } catch (error: any) {
    console.error('Error in handleChatRequest:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
