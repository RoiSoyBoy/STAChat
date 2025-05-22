import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error('OpenAI API key is not defined in environment variables.');
}

export const openai = new OpenAI({
  apiKey: apiKey,
});
