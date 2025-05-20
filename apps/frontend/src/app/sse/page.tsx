import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default function SsePage() {
  return <div style={{display: 'none'}} />;
} 