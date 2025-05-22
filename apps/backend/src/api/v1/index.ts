import { Router } from 'express';
import chatRoutes from './chat/chat.routes';
import processPdfRoutes from './process-pdf/route';
import fetchUrlRouter from './fetch-url/route'; // Import the fetch-url router

// Import other v1 route modules here in the future
// import userRoutes from './user/user.routes';

const v1Router = Router();

v1Router.use('/chat', chatRoutes);
v1Router.use('/process-pdf', processPdfRoutes);
v1Router.use('/fetch-url', fetchUrlRouter); // Use the fetch-url router

// v1Router.use('/users', userRoutes);

export default v1Router;
