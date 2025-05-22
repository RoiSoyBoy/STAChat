/**
 * Interface for objects containing a question and an answer.
 */
export interface QAObject {
  question: string;
  answer: string;
}

/**
 * Removes URLs from a given string and trims whitespace.
 * @param text The input string.
 * @returns The string with URLs removed and whitespace trimmed.
 */
export function cleanString(text: string): string {
  // Regular expression to match common URL patterns.
  // This regex looks for:
  // - http:// or https://
  // - www. (without http/https)
  // followed by a sequence of characters that can appear in URLs (alphanumeric, ., /, ?, =, &, -, _, ~)
  const urlRegex = /(?:https?:\/\/|www\.)[\w\.\/\?=\&\-\_\~]+/gi;
  
  // Remove all occurrences of URLs
  const textWithoutUrls = text.replace(urlRegex, '');
  
  // Trim whitespace from the beginning and end of the string
  return textWithoutUrls.trim();
}

/**
 * Cleans an array of QA objects by removing URLs from their question and answer properties
 * and trimming whitespace.
 *
 * @param qaArray An array of objects, where each object has 'question' and 'answer' string properties.
 * @returns A new array with the modified QA objects.
 */
export function cleanQAArray(qaArray: QAObject[]): QAObject[] {
  // Iterate over each object in the array and apply the cleaning logic.
  // The .map() method creates a new array with the results of calling a provided function
  // on every element in the calling array.
  return qaArray.map(qa => {
    return {
      question: cleanString(qa.question),
      answer: cleanString(qa.answer),
    };
  });
}

/*
// Example Usage:
const sampleData: QAObject[] = [
  {
    question: "What is www.example.com about?",
    answer: "It's a sample website. More info at http://example.org/info?query=test.",
  },
  {
    question: "  Find details at https://another-example.net/page  ",
    answer: "  The answer is on that page.  ",
  },
  {
    question: "No URLs here.",
    answer: "Just plain text.",
  }
];

const cleanedData = cleanQAArray(sampleData);
console.log(cleanedData);
// Expected Output:
// [
//   { question: 'What is  about?', answer: "It's a sample website. More info at ." },
//   { question: 'Find details at', answer: 'The answer is on that page.' },
//   { question: 'No URLs here.', answer: 'Just plain text.' }
// ]
*/
