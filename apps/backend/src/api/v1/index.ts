import { Router } from 'express';
import chatRoutes from './chat/chat.routes';
// Import other v1 route modules here in the future
// import userRoutes from './user/user.routes';

const v1Router = Router();

v1Router.use('/chat', chatRoutes);
// v1Router.use('/users', userRoutes);

export default v1Router;
