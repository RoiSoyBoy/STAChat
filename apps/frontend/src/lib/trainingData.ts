export interface QnAPair {
  question: string;
  answer: string;
}

export async function processTrainingData(file: File): Promise<QnAPair[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          reject(new Error("הקובץ ריק או שלא ניתן לקריאה"));
          return;
        }

        const lines = text.split("\\n").filter((line) => line.trim());

        if (lines.length === 0) {
          reject(new Error("הקובץ ריק לאחר עיבוד שורות"));
          return;
        }

        const pairs: QnAPair[] = lines.map((line) => {
          const [question, answer] = line.split("|").map((s) => s.trim());
          if (!question || !answer) {
            // Consider if a single malformed line should stop everything or be skipped
            throw new Error(
              "פורמט לא תקין - כל שורה חייבת להכיל שאלה ותשובה מופרדות ב-|"
            );
          }
          return { question, answer };
        });

        resolve(pairs);
      } catch (error) {
        console.error(
          "Error processing training data from file content:",
          error
        );
        if (error instanceof Error) {
          reject(new Error(`שגיאה בעיבוד קובץ האימון: ${error.message}`));
        } else {
          reject(new Error("שגיאה לא ידועה בעיבוד קובץ האימון."));
        }
      }
    };

    reader.onerror = (error) => {
      console.error("FileReader error:", error);
      reject(new Error("שגיאה בקריאת הקובץ"));
    };

    reader.readAsText(file);
  });
}
