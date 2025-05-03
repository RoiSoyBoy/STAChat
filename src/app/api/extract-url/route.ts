import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import * as cheerio from 'cheerio';
import { extractQAFromText, extractQAFromTextWithLLM } from '@/lib/preprocess';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const { url, clientId } = await request.json();
    if (!url || !clientId) {
      return NextResponse.json({ error: 'Missing url or clientId' }, { status: 400 });
    }

    // Prevent duplicate URL
    const existing = await adminDb
      .collection('trainingData')
      .doc(clientId)
      .collection('urls')
      .where('url', '==', url)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ error: 'URL already exists' }, { status: 409 });
    }

    // Fetch HTML with ScrapingBee if API key is present, else fallback to regular fetch
    let html: string;
    const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
    if (SCRAPINGBEE_API_KEY) {
      const apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true`;
      let beeRes;
      try {
        beeRes = await fetch(apiUrl, { method: 'GET' });
      } catch (err: any) {
        console.error('ScrapingBee network error:', err);
        return NextResponse.json({ error: 'Network error during ScrapingBee fetch', details: String(err) }, { status: 500 });
      }
      if (!beeRes.ok) {
        console.error('ScrapingBee error:', beeRes.status, beeRes.statusText);
        return NextResponse.json({ error: 'Failed to fetch URL (ScrapingBee)' }, { status: 400 });
      }
      html = await beeRes.text();
    } else {
      // Fallback: Fetch HTML with realistic headers and timeout
      let res;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15 seconds
      try {
        res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept':
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
          },
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        if (fetchErr.name === 'AbortError') {
          console.error('Fetch timeout for URL:', url);
          return NextResponse.json({ error: 'Timeout fetching URL' }, { status: 504 });
        }
        console.error('Network error during fetch:', fetchErr);
        return NextResponse.json({ error: 'Network error during fetch', details: String(fetchErr) }, { status: 500 });
      }
      clearTimeout(timeout);
      if (!res.ok) {
        console.error('Failed to fetch URL:', url, res.status, res.statusText);
        return NextResponse.json({ error: 'Failed to fetch URL', status: res.status, statusText: res.statusText }, { status: 400 });
      }
      html = await res.text();
    }

    // Extract main content
    const $ = cheerio.load(html);
    let extractedText: string[] = [];
    $('h1, h2, h3, h4, h5, h6, p, li').each((_, el) => {
      const text = $(el).text().trim();
      if (text) extractedText.push(text);
    });
    const joinedText = extractedText.join('\n');

    // Structured data extraction (from regex QAs)
    const regexQAs = extractQAFromText(joinedText);
    const structured: Record<string, string> = {};
    for (const qa of regexQAs) {
      // Heuristic: use the question as the key (normalized)
      const key = qa.question.replace(/[^\u0590-\u05FF\w\s]/g, '').replace(/\s+/g, '_').toLowerCase();
      structured[key] = qa.answer;
    }

    // Store in Firestore
    let docRef;
    try {
      docRef = await adminDb
        .collection('trainingData')
        .doc(clientId)
        .collection('urls')
        .add({
          url,
          extractedText: joinedText,
          structured,
          createdAt: Date.now(),
        });
      // Preprocess Q&A and save to 'training' collection (with embeddings)
      const qas = await extractQAFromTextWithLLM(joinedText);
      for (const qa of qas) {
        // Generate embedding for the question
        let embedding = null;
        try {
          const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: qa.question,
          });
          embedding = embeddingRes.data[0].embedding;
        } catch (embedErr) {
          console.error('Embedding error:', embedErr);
        }
        // Save to training collection (legacy/global)
        await adminDb.collection('training').add({
          question: qa.question,
          answer: qa.answer,
          sourceUrl: url,
          embedding,
          timestamp: Date.now(),
        });
        // Save to trainingEmbeddings/{clientId}/qas (for semantic search)
        try {
          await adminDb
            .collection('trainingEmbeddings')
            .doc(clientId)
            .collection('qas')
            .add({
              question: qa.question,
              answer: qa.answer,
              sourceUrl: url,
              embedding,
              timestamp: Date.now(),
            });
        } catch (firestoreEmbedErr) {
          console.error('Error saving embedding Q&A:', firestoreEmbedErr);
        }
      }
    } catch (firestoreErr) {
      console.error('Firestore save error:', firestoreErr);
      return NextResponse.json({ error: 'Failed to save to Firestore', details: String(firestoreErr) }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: docRef.id, url, extractedText: joinedText });
  } catch (error) {
    console.error('Extract URL error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 