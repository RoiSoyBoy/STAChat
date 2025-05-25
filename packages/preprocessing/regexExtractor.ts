import { QA } from './types';

// Structured regex patterns for better maintainability
const REGEX_PATTERNS = {
  // Contact Information
  address: {
    pattern: /כתובת[:\s]+([^\n]+)/gi,
    question: 'מה הכתובת?'
  },
  phone: {
    pattern: /טל[׳']?[:\s]+([0-9\-\s()]+)/gi,
    question: 'מה הטלפון?'
  },
  fax: {
    pattern: /פקס[:\s]+([0-9\-\s()]+)/gi,
    question: 'מה מספר הפקס?'
  },
  whatsapp: {
    pattern: /וואטסאפ[:\s]+([0-9\-\s()]+)/gi,
    question: 'מה מספר הוואטסאפ?'
  },
  email: {
    pattern: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    question: 'מה כתובת המייל?'
  },
  website: {
    pattern: /(https?:\/\/[\w\.-]+\.[a-z]{2,}(?:\/[\w\-\/?=&#%]*)?)/gi,
    question: 'מה האתר של העסק?'
  },

  // Business Hours & Operations
  hours: {
    pattern: /שעות פתיחה[:\s]+([^\n]+)/gi,
    question: 'מהן שעות הפתיחה?'
  },
  deliveryAreas: {
    pattern: /אזור(?:י)? משלוח[:\s]+([^\n]+)/gi,
    question: 'לאן ניתן להזמין משלוח?'
  },
  serviceArea: {
    pattern: /אזור(?:י)? שירות[:\s]+([^\n]+)/gi,
    question: 'מהו אזור השירות?'
  },

  // Business Details
  manager: {
    pattern: /(?:מנהל|בעלים|בעל העסק)[:\s]+([^\n]+)/gi,
    questions: ['מי המנהל?', 'מי הבעלים?']
  },
  businessNumber: {
    pattern: /(?:מספר עסק|מספר רישיון|רישיון עסק)[:\s]+([\w\d]+)/gi,
    questions: ['מה מספר העסק?', 'מה מספר הרישיון?']
  },
  founded: {
    pattern: /(?:שנת ייסוד|נוסד בשנת|הוקם בשנת)[:\s]*([\d]{4})/gi,
    question: 'מתי נוסד העסק?'
  },
  branchCount: {
    pattern: /(?:מספר סניפים|כמות סניפים)[:\s]+([\d]+)/gi,
    question: 'כמה סניפים יש לעסק?'
  },

  // Services & Features
  payment: {
    pattern: /(?:אמצעי|אפשרויות) תשלום[:\s]+([^\n]+)/gi,
    question: 'באילו אמצעי תשלום ניתן לשלם?'
  },
  kosher: {
    pattern: /כשרות[:\s]+([^\n]+)/gi,
    question: 'האם המקום כשר?'
  },
  vegan: {
    pattern: /(?:טבעוני|צמחוני)[:\s]+([^\n]+)/gi,
    question: 'האם יש מנות טבעוניות/צמחוניות?'
  },
  parking: {
    pattern: /חניה[:\s]+([^\n]+)/gi,
    question: 'האם יש חניה?'
  },
  accessibility: {
    pattern: /נגישות[:\s]+([^\n]+)/gi,
    question: 'האם המקום נגיש?'
  },
  wifi: {
    pattern: /WiFi[:\s]+([^\n]+)/gi,
    question: 'האם יש WiFi?'
  },
  reservation: {
    pattern: /(?:הזמנה מראש|הזמנות מראש)[:\s]+([^\n]+)/gi,
    question: 'האם צריך להזמין מקום מראש?'
  },
  menu: {
    pattern: /תפריט(?:ים)?[:\s]*([^\n]+)/gi,
    question: 'האם יש תפריט?'
  },
  loyaltyClub: {
    pattern: /(?:מועדון לקוחות|מועדון חברים)[:\s]+([^\n]+)/gi,
    question: 'האם יש מועדון לקוחות?'
  },
  app: {
    pattern: /אפליקציה[:\s]+([^\n]+)/gi,
    question: 'האם יש אפליקציה?'
  },
  languages: {
    pattern: /שפות[:\s]+([^\n]+)/gi,
    question: 'באילו שפות ניתן לקבל שירות?'
  },

  // General Information
  about: {
    pattern: /(?:אודות|על העסק|מי אנחנו)[:\s]+([^\n]+)/gi,
    question: 'ספר לי על העסק.'
  },
  reviews: {
    pattern: /ביקורות[:\s]+([^\n]+)/gi,
    question: 'מה חושבים על המקום?'
  },
  openDate: {
    pattern: /(?:נוסד|נפתח|הוקם)[:\s]+([^\n]+)/gi,
    question: 'מתי נפתח העסק?'
  },
  closeDate: {
    pattern: /(?:נסגר|סגור)[:\s]+([^\n]+)/gi,
    question: 'מתי נסגר העסק?'
  }
} as const;

/**
 * Extract branch information with special logic
 */
function extractBranches(text: string): QA[] {
  const qas: QA[] = [];
  const branchLineRegex = /^( -  \S+|[\u0590-\u05FF\w]+)\s+([\u0590-\u05FF\w]+)\s+([\u0590-\u05FF\w\s\d\-,]+)/gm;
  const branches: string[] = [];
  let brandName = '';
  let match;

  while ((match = branchLineRegex.exec(text)) !== null) {
    if (!brandName) brandName = match[1].trim();
    branches.push(`${match[2].trim()}: ${match[3].trim()}`);
  }

  if (branches.length > 0 && brandName) {
    const brandVariants = [brandName];
    if (!brandName.includes('שווארמה')) {
      brandVariants.push('שווארמה ' + brandName);
    }

    for (const variant of brandVariants) {
      qas.push({
        question: `מה הם הסניפים של ${variant}?`,
        answer: branches.join('; '),
        source: 'regex',
        confidence: 0.9
      });
    }
  }

  return qas;
}

/**
 * Extract matches for a specific pattern configuration
 */
function extractPattern(text: string, config: any): QA[] {
  const qas: QA[] = [];
  let match;

  while ((match = config.pattern.exec(text)) !== null) {
    const answer = match[1]?.trim();
    if (!answer) continue;

    if (config.questions) {
      // Multiple questions for the same answer
      for (const question of config.questions) {
        qas.push({
          question,
          answer,
          source: 'regex',
          confidence: 0.8
        });
      }
    } else if (config.question) {
      // Single question
      qas.push({
        question: config.question,
        answer,
        source: 'regex',
        confidence: 0.8
      });
    }
  }

  return qas;
}

/**
 * Extract Q&A pairs using regex patterns
 */
export function extractWithRegex(text: string): QA[] {
  const qas: QA[] = [];

  // Special handling for branches
  const branchQAs = extractBranches(text);
  qas.push(...branchQAs);

  // Process all other patterns
  for (const [_key, config] of Object.entries(REGEX_PATTERNS)) {
    const matches = extractPattern(text, config);
    qas.push(...matches);
  }

  return qas;
}
