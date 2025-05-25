import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import { OPENAI_EMBEDDING_MODEL } from 'shared';

export interface PineconeMatch {
  id: string;
  score: number;
  metadata: {
    userId: string;
    documentName: string;
    originalFilename: string;
    chunkIndex: number;
    sourceType: string;
    text?: string;
    url?: string;
    question?: string;
    answer?: string;
    originalSourceUrl?: string;
    [key: string]: any;
  };
  values: number[];
}

export interface ContextResult {
  context: string;
  sources: Array<{
    id: string;
    documentName?: string;
    originalFilename?: string;
    chunkIndex?: number;
    sourceType?: string;
    url?: string;
    score: number;
  }>;
  citationMap: Record<number, {
    sourceType?: string;
    fileName?: string;
    url?: string;
    chunkIndex?: number;
    documentName?: string;
    originalFilename?: string;
  }>;
}

export async function generateContextFromPinecone({
  userId,
  question,
  pineconeApiKey,
  pineconeIndex,
  openaiApiKey,
  similarityThreshold = 0.75,
  topK = 5,
}: {
  userId: string;
  question: string;
  pineconeApiKey: string;
  pineconeIndex: string;
  openaiApiKey: string;
  similarityThreshold?: number;
  topK?: number;
}): Promise<ContextResult> {
  // 1. Embed the question
  const openai = new OpenAI({ apiKey: openaiApiKey });
  const embeddingResp = await openai.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: question,
  });
  const embedding = embeddingResp.data[0].embedding;

  console.log(`[generateContextFromPinecone] Parameters: userId='${userId}', question='${question.substring(0, 50)}...', similarityThreshold=${similarityThreshold}, topK=${topK}`);

  const pinecone = new Pinecone({ apiKey: pineconeApiKey });
  const indexName = pineconeIndex;
  const queryVector = embedding;
  const index = pinecone.index(indexName).namespace(`user-${userId}`);

  console.log('=== PINECONE SEARCH START ===');
  console.log('Index name:', indexName);
  console.log('Query vector dimensions:', queryVector?.length);
  console.log('User ID for namespacing:', userId);
  console.log('Similarity threshold:', similarityThreshold);

  try {
    const stats = await index.describeIndexStats();
    console.log('Index total records:', stats.totalRecordCount ?? 'N/A');
    console.log('Index dimensions:', stats.dimension);
    
    const namespaceStats = stats.namespaces?.[`user-${userId}`];
    if (namespaceStats) {
      console.log(`Stats for namespace 'user-${userId}':`, namespaceStats);
      console.log(`Record count in namespace:`, namespaceStats.recordCount ?? 'N/A');
    } else {
      console.log(`No stats for namespace 'user-${userId}' - might be empty.`);
    }
  } catch (statsError) {
    console.error('Error fetching index stats:', statsError);
  }

  // 2. ביצוע חיפוש מרובה שלבים לשיפור התוצאות
  
  // שלב 1: חיפוש רגיל
  const pineconeQueryTopK = Math.max(topK * 2, 10); // הבאת יותר תוצאות לסינון
  
  let queryResp = await index.query({
    vector: queryVector,
    topK: pineconeQueryTopK,
    includeMetadata: true,
  });
  
  let allMatches: PineconeMatch[] = (queryResp.matches || []) as any;
  console.log(`Initial query returned ${allMatches.length} matches. Top scores: ${allMatches.slice(0, 5).map(m => m.score.toFixed(4)).join(', ')}`);
  // --- DIAGNOSTIC LOG: Raw initial matches ---
  console.log(`[DIAGNOSTIC] Top 5 raw initial matches:`);
  allMatches.slice(0, 5).forEach((match, idx) => {
    console.log(`  [Initial Match ${idx+1}] Score: ${match.score.toFixed(4)}, ID: ${match.id}, Type: ${match.metadata?.sourceType}`);
    const textPreview = match.metadata?.text || match.metadata?.question || match.metadata?.answer || '';
    console.log(`    Text: ${textPreview.substring(0, 100)}...`);
  });
  // --- END DIAGNOSTIC LOG ---
  
  // שלב 2: אם אין תוצאות טובות, נסה חיפוש עם וקטור מעט שונה
  if (allMatches.length === 0 || (allMatches.length > 0 && allMatches[0].score < similarityThreshold)) {
    console.log('Trying hybrid search approach...');
    
    // נסה חיפוש עם topK גדול יותר
    const hybridQueryResp = await index.query({
      vector: queryVector,
      topK: Math.min(50, pineconeQueryTopK * 3), // חיפוש רחב יותר
      includeMetadata: true,
    });
    
    const hybridMatches: PineconeMatch[] = (hybridQueryResp.matches || []) as any;
    console.log(`Hybrid search returned ${hybridMatches.length} matches. Top scores: ${hybridMatches.slice(0, 5).map(m => m.score.toFixed(4)).join(', ')}`);
    
    // שלב את התוצאות אם החיפוש ההיברידי טוב יותר
    if (hybridMatches.length > allMatches.length || 
        (hybridMatches.length > 0 && allMatches.length > 0 && hybridMatches[0].score > allMatches[0].score)) {
      allMatches = hybridMatches;
    }
  }
  
  console.log('=== PINECONE SEARCH END ===');

  // 3. סינון ועיבוד תוצאות מתקדם
  
  // סינון ראשוני לפי סף
  let filteredMatches = allMatches.filter(m => m.score >= similarityThreshold);
  console.log(`After threshold filtering (>= ${similarityThreshold}): ${filteredMatches.length} matches`);
  
  // אם אין תוצאות, הורד את הסף בהדרגה
  if (filteredMatches.length === 0 && allMatches.length > 0) {
    const relaxedThreshold = Math.max(similarityThreshold - 0.2, 0.1);
    filteredMatches = allMatches.filter(m => m.score >= relaxedThreshold);
    console.log(`Relaxed threshold to ${relaxedThreshold}: ${filteredMatches.length} matches`);
  }
  
  // מיון לפי relevance score (שילוב של score ו-source type)
  const scoredMatches = filteredMatches.map(match => ({
    ...match,
    relevanceScore: calculateRelevanceScore(match, question)
  })).sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // בחירת התוצאות הטובות ביותר
  const finalMatchesToProcess = scoredMatches.slice(0, topK);
  console.log(`Final matches selected: ${finalMatchesToProcess.length}`);
  console.log('Final match scores (raw score(relevance score)):', finalMatchesToProcess.map(m => `${m.score.toFixed(3)}(${m.relevanceScore.toFixed(3)})`).join(', '));
  // --- DIAGNOSTIC LOG: Final selected matches content ---
  console.log(`[DIAGNOSTIC] Content of final selected matches:`);
  finalMatchesToProcess.forEach((match, idx) => {
    console.log(`  [Final Match ${idx+1}] Score: ${match.score.toFixed(4)}, Relevance: ${match.relevanceScore.toFixed(4)}, ID: ${match.id}, Type: ${match.metadata?.sourceType}`);
    const textPreview = match.metadata?.text || match.metadata?.question || match.metadata?.answer || '';
    console.log(`    Text: ${textPreview.substring(0, 150)}...`);
  });
  // --- END DIAGNOSTIC LOG ---

  if (finalMatchesToProcess.length === 0) {
    return { context: '', sources: [], citationMap: {} };
  }

  // 4. בניית הקשר מותאם
  const contextParts: string[] = [];
  const sources: ContextResult['sources'] = [];
  const citationMap: ContextResult['citationMap'] = {};
  let sourceCounter = 0;

  // קיבוץ לפי סוג מקור
  const qaMatches = finalMatchesToProcess.filter(m => m.metadata.sourceType === 'qa');
  const docMatches = finalMatchesToProcess.filter(m => m.metadata.sourceType !== 'qa');

  // הוספת Q&A matches עם עדיפות
  if (qaMatches.length > 0) {
    contextParts.push("🔍 שאלות ותשובות רלוונטיות:");
    qaMatches.forEach((match) => {
      sourceCounter++;
      const question = match.metadata.question || 'לא זמין';
      const answer = match.metadata.answer || 'לא זמין';
      const confidence = match.score >= 0.8 ? '(רלוונטיות גבוהה)' : 
                        match.score >= 0.5 ? '(רלוונטיות בינונית)' : 
                        '(רלוונטיות נמוכה)';
      
      contextParts.push(`[${sourceCounter}] ${confidence}\nשאלה: ${question}\nתשובה: ${answer}`);
      
      sources.push({
        id: match.id,
        sourceType: 'qa',
        documentName: `Q&A: ${question.substring(0, 50)}...`,
        url: match.metadata.originalSourceUrl,
        originalFilename: match.metadata.originalFilename,
        score: match.score,
      });
      
      citationMap[sourceCounter] = {
        sourceType: 'qa',
        fileName: `שאלה: ${question.substring(0, 50)}...`,
        documentName: match.metadata.originalFilename || match.metadata.originalSourceUrl,
        originalFilename: match.metadata.originalFilename,
        url: match.metadata.originalSourceUrl,
      };
    });
  }

  // הוספת document matches
  if (docMatches.length > 0) {
    if (qaMatches.length > 0) {
      contextParts.push("\n📄 מידע נוסף ממסמכים:");
    } else {
      contextParts.push("📄 מידע רלוונטי ממסמכים:");
    }
    
    docMatches.forEach((match) => {
      sourceCounter++;
      const docName = match.metadata.documentName || match.metadata.originalFilename || 'מסמך לא מזוהה';
      const text = match.metadata.text || '';
      const confidence = match.score >= 0.8 ? '(רלוונטיות גבוהה)' : 
                        match.score >= 0.5 ? '(רלוונטיות בינונית)' : 
                        '(רלוונטיות נמוכה)';
      
      contextParts.push(`[${sourceCounter}] מתוך: ${docName} ${confidence}\nתוכן: ${text.substring(0, 700)}${text.length > 700 ? '...' : ''}`);
      
      sources.push({
        id: match.id,
        documentName: match.metadata.documentName,
        originalFilename: match.metadata.originalFilename,
        chunkIndex: match.metadata.chunkIndex,
        sourceType: match.metadata.sourceType,
        url: match.metadata.url,
        score: match.score,
      });
      
      citationMap[sourceCounter] = {
        sourceType: match.metadata.sourceType,
        fileName: docName,
        url: match.metadata.url,
        chunkIndex: match.metadata.chunkIndex,
        documentName: match.metadata.documentName,
        originalFilename: match.metadata.originalFilename,
      };
    });
  }

  const finalContext = contextParts.join('\n\n');
  console.log(`Generated context length: ${finalContext.length} chars`);
  
  return {
    context: finalContext,
    sources,
    citationMap,
  };
}

// פונקציה לחישוב relevance score מתקדם
function calculateRelevanceScore(match: PineconeMatch, question: string): number {
  let score = match.score;
  
  // בונוס לQ&A matches (reduced)
  if (match.metadata.sourceType === 'qa') {
    score += 0.05; 
  }
  
  // בונוס אם יש התאמה בין מילות מפתח
  const questionWords = question.toLowerCase().split(/\s+/);
  const textToCheck = (match.metadata.text || match.metadata.question || match.metadata.answer || '').toLowerCase();
  
  const keywordMatches = questionWords.filter(word => 
    word.length > 2 && textToCheck.includes(word)
  ).length;
  
  if (keywordMatches > 0) {
    score += keywordMatches * 0.05;
  }
  
  // פנלטי לtexts קצרים מדי (temporarily removed for testing)
  // const textLength = (match.metadata.text || match.metadata.answer || '').length;
  // if (textLength < 50) {
  //   score -= 0.1;
  // }
  
  return Math.min(score, 1.0); // cap at 1.0
}
