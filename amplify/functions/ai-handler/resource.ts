import { defineFunction } from '@aws-amplify/backend';

export const aiHandler = defineFunction({
  name: 'ai-handler',
  entry: './handler.ts',
  environment: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  },
});
