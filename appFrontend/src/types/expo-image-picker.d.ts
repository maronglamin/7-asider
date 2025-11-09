declare module 'expo-image-picker' {
  export const MediaTypeOptions: any;
  export function requestMediaLibraryPermissionsAsync(): Promise<{ status: 'granted' | 'denied' | 'undetermined' }>;
  export function launchImageLibraryAsync(options?: any): Promise<{
    canceled: boolean;
    assets?: Array<{
      uri: string;
      fileName?: string;
      mimeType?: string;
      width?: number;
      height?: number;
    }>;
  }>;
}


