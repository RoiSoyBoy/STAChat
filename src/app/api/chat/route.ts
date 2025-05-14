import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { checkRateLimit, getRateLimitResponse, withCache, CACHE_KEYS } from '@/lib/cache'; // Use correct rate limit functions
import { generateContextFromPinecone } from '@/lib/generateContextFromPinecone'; // Assuming RAG setup
import { buildPrompt } from '@/lib/buildPrompt'; // Assuming prompt building
import OpenAI from 'openai'; // Import OpenAI
import { saveMessage } from '@/lib/firebase-utils'; // Assuming message saving utility

// Basic implementation - replace with actual logic
export async function POST(req: NextRequest) {
  console.log('[API /api/chat] Received POST request.');
  try {
    // --- Authentication (REMOVED for public access as no login system is implemented yet) ---
    // const authorization = req.headers.get('Authorization');
    // console.log('[API /api/chat] Authorization header:', authorization);
    // if (!authorization?.startsWith('Bearer ')) {
    //   console.error('[API /api/chat] Unauthorized: Missing or malformed Bearer token.');
    //   return NextResponse.json({ error: 'Unauthorized: Missing or malformed Bearer token' }, { status: 401 });
    // }
    // const token = authorization.substring(7);
    // console.log('[API /api/chat] Received token (first 10 chars):', token.substring(0, 10) + '...');
    // // TODO: Add actual token verification logic here (e.g., using getAuth().verifyIdToken(token))
    // // For now, proceeding if Bearer token format is correct.
    // // Example verification (uncomment and adapt if using Firebase Auth):
    // // try {
    // //   const decodedToken = await getAuth().verifyIdToken(token);
    // //   const userId = decodedToken.uid;
    // //   console.log('[API /api/chat] Token verified. User ID:', userId);
    // //   // Attach userId to request or use as needed
    // // } catch (authError: any) {
    // //   console.error('[API /api/chat] Token verification failed:', authError.message);
    // //   return NextResponse.json({ error: 'Token verification failed', details: authError.message }, { status: 401 });
    // // }
    console.log('[API /api/chat] Skipping user authentication as no login system is in place.');

    // --- Rate Limiting ---
    const ip = req.ip ?? req.headers.get('x-forwarded-for') ?? 'unknown'; // Get client IP
    if (!checkRateLimit(ip)) {
      return getRateLimitResponse();
    }

    // --- Input Validation (Example) ---
    let message, clientId;
    try {
      const body = await req.json();
      message = body.message;
      clientId = body.clientId;
      console.log('[API /api/chat] Request body parsed:', body);
    } catch (e: any) {
      console.error('[API /api/chat] Error parsing JSON body:', e.message);
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!message || !clientId) {
      console.error('[API /api/chat] Missing message or clientId in request body.');
      return NextResponse.json({ error: 'Missing message or clientId' }, { status: 400 });
    }

    // --- API Key Checks ---
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndexName = process.env.PINECONE_INDEX;

    if (!openaiApiKey) {
      console.error('ERROR: OPENAI_API_KEY environment variable is not defined for /api/chat.');
      return NextResponse.json({ error: 'OpenAI API Key not configured on server' }, { status: 500 });
    }
    if (!pineconeApiKey) {
      console.error('ERROR: PINECONE_API_KEY environment variable is not defined for /api/chat.');
      return NextResponse.json({ error: 'Pinecone API Key not configured on server' }, { status: 500 });
    }
    if (!pineconeIndexName) {
      console.error('ERROR: PINECONE_INDEX environment variable is not defined for /api/chat.');
      return NextResponse.json({ error: 'Pinecone Index not configured on server' }, { status: 500 });
    }
    console.log('[API /api/chat] All required API keys (OpenAI, Pinecone) and Pinecone Index are found.');
    
    const openai = new OpenAI({ apiKey: openaiApiKey });

    console.log(`[API /api/chat] Processing message: "${message}" for client: ${clientId}`);

    try {
      // --- Actual OpenAI API Call ---
      // 1. Generate context from Pinecone (your RAG data)
      console.log(`[API /api/chat] Generating context from Pinecone for message: "${message}", original clientId: ${clientId}`);
      // TEMPORARY TEST: Hardcoding userId to 'test-user' to match ingestion
      const testUserId = 'test-user';
      console.log(`[API /api/chat] USING HARDCODED userId: '${testUserId}' for Pinecone query.`);
      const contextResult = await generateContextFromPinecone({
        userId: testUserId, // Using 'test-user' to match where fetch-url ingested data
        question: message,
        pineconeApiKey: pineconeApiKey,
        pineconeIndex: pineconeIndexName,
        openaiApiKey: openaiApiKey, // generateContextFromPinecone also needs this to embed the question
        // similarityThreshold and topK can be added here if needed, otherwise defaults from the function will be used
      });
      
      const actualContextText = contextResult.context;
      const retrievedSources = contextResult.sources;

      if (!actualContextText || actualContextText.trim() === "") {
        console.warn("[API /api/chat] No context retrieved from Pinecone or context is empty.");
      } else {
        console.log("[API /api/chat] Context retrieved from Pinecone (first 100 chars):", actualContextText.substring(0, 100) + "...");
        console.log("[API /api/chat] Retrieved sources:", JSON.stringify(retrievedSources.slice(0,2)) + "..."); // Log first 2 sources
      }

      // 2. Build a prompt - using a more direct RAG instruction
      const userQuery = message; // Renaming for clarity in the prompt
      const prompt = `Based *only* on the following context, answer the user's query. If the answer is not found in the context, clearly state that you don't have enough information from the provided documents. Do not use any external knowledge or make assumptions.\n\nContext:\n---\n${actualContextText || "No relevant context provided."}\n---\n\nUser Query: ${userQuery}\n\nAnswer:`;

      console.log('[API /api/chat] Sending request to OpenAI with prompt (first 200 chars of prompt):', prompt.substring(0,200) + "...");
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL_CHAT || 'gpt-3.5-turbo', 
        messages: [
          { role: 'system', content: "You are an AI assistant. Your task is to answer questions in Hebrew, based *strictly* on the provided context. If the answer is not found in the context, you must state in Hebrew that you do not have enough information from the provided documents. Do not use any external knowledge or make assumptions." },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2, 
      });

      const responseText = completion.choices[0]?.message?.content?.trim() || 'Sorry, I could not process your request at this time.';
      // Use the sources retrieved from Pinecone
      const sources = retrievedSources.map(s => s.url || s.documentName || s.originalFilename || s.id); 

      console.log('[API /api/chat] OpenAI response received:', responseText);

      // 4. Save user message and AI response (Example)
      // await saveMessage(clientId, { role: 'user', content: message });
      // await saveMessage(clientId, { role: 'assistant', content: responseText });

      return NextResponse.json({ response: responseText, sources });

    } catch (openaiError: any) {
      console.error('[API /api/chat] Error calling OpenAI API:', openaiError.message);
      if (openaiError.status === 401) {
        console.error('[API /api/chat] OpenAI API returned 401 Unauthorized. Check your OPENAI_API_KEY.');
        return NextResponse.json({ error: 'OpenAI authentication failed. Please check server configuration.' }, { status: 500 });
      }
      // Handle other OpenAI errors (e.g., rate limits, server errors)
      return NextResponse.json({ error: 'Failed to get response from AI model', details: openaiError.message }, { status: 502 }); // Bad Gateway
    }

  } catch (error: any) {
    console.error('[API /api/chat] General error in POST handler:', error.message, error.stack);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
