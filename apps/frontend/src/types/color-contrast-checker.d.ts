declare module "color-contrast-checker" {
  export class ColorContrastChecker {
    isLevelAA(color: string, backgroundColor: string): boolean;
    isLevelAAA(color: string, backgroundColor: string): boolean;
  }
}
