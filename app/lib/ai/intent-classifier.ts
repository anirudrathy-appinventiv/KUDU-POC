import OpenAI from 'openai';
import { ChatMessage } from '@/app/types/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type IntentType = 'data_query' | 'general_conversation' | 'visualization_feedback';

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
}

/**
 * Classifies user intent to determine if they want to query data, have a general conversation, or provide visualization feedback
 * Uses conversation history to maintain context
 */
export async function classifyIntent(
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<IntentClassification> {
  const lowerMessage = userMessage.toLowerCase().trim();
  
  // Quick pattern matching for common greetings and general conversation (including Arabic)
  const generalPatterns = [
    /^(hi|hello|hey|greetings|good morning|good afternoon|good evening|howdy|مرحبا|السلام عليكم|أهلاً)$/i,
    /^(thanks|thank you|thx|appreciate it|شكراً|شكرا لك)$/i,
    /^(bye|goodbye|see you|farewell|مع السلامة|وداعاً)$/i,
    /^(help|what can you do|what do you do|how does this work|مساعدة)$/i,
    /^(who are you|what are you|من أنت)$/i,
  ];

  // Check for obvious general conversation patterns
  for (const pattern of generalPatterns) {
    if (pattern.test(lowerMessage)) {
      return {
        intent: 'general_conversation',
        confidence: 0.9,
      };
    }
  }

  // Check if last message had a visualization (for visualization feedback detection)
  const lastAssistantMessage = conversationHistory
    .slice()
    .reverse()
    .find(msg => msg.role === 'assistant');
  const hasRecentVisualization = lastAssistantMessage?.visualizationPlan?.shouldVisualize;

  // Patterns to detect visualization feedback
  const visualizationFeedbackPatterns = [
    /\b(make it a|change to|convert to|show as)\s+(line|bar|pie|area|scatter)\s+(chart|graph)?/i,
    /\b(put|use|place|set)\s+(\w+)\s+(on|for|as)\s+(x|y)[\s-]?axis/i,
    /\b(change|switch|modify|update)\s+(the\s+)?(chart|graph|visualization|viz)/i,
    /^(make it|change it|show it|display it)/i,
  ];

  // If there's a recent visualization and user is giving feedback, classify as visualization_feedback
  if (hasRecentVisualization) {
    for (const pattern of visualizationFeedbackPatterns) {
      if (pattern.test(userMessage)) {
        return {
          intent: 'visualization_feedback',
          confidence: 0.9,
        };
      }
    }
  }

  // Check for data query indicators
  const dataQueryIndicators = [
    /\b(show|display|list|find|get|select|query|fetch|count|sum|avg|max|min|group|order|where|from|table|column)\b/i,
    /\b(how many|how much|what is|what are|which|when|where)\b/i,
    /\b(top|bottom|first|last|latest|recent|oldest)\b/i,
    /\b(sales|revenue|orders|customers|products|stores|transactions|performance|analytics)\b/i,
  ];

  const hasDataQueryIndicators = dataQueryIndicators.some(pattern => pattern.test(userMessage));
  
  // If message is very short and has no data query indicators, likely general conversation
  if (userMessage.length < 10 && !hasDataQueryIndicators) {
    return {
      intent: 'general_conversation',
      confidence: 0.7,
    };
  }

  // Use OpenAI for ambiguous cases with conversation context
  try {
    // Build conversation context for better classification
    const contextMessages = conversationHistory
      .slice(-4) // Last 4 messages for context
      .map((msg) => ({
        role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: msg.role === 'user' ? msg.content : (msg.content || ''),
      }));

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: `You are an intent classifier for KUDU's data analysis assistant. Classify the user's message as one of:
- "data_query": User wants to query or analyze KUDU's business data (sales, stores, products, customers, etc.) or drill down into previous results
- "general_conversation": User is greeting, asking for help, or having general conversation
- "visualization_feedback": User wants to modify the current chart/visualization (change chart type, axes, etc.)

Consider the conversation context. Respond with ONLY one word: "data_query", "general_conversation", or "visualization_feedback"`,
        },
        ...contextMessages,
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.1,
      max_tokens: 10,
    });

    const classification = completion.choices[0]?.message?.content?.trim().toLowerCase();
    
    if (classification === 'general_conversation') {
      return {
        intent: 'general_conversation',
        confidence: 0.85,
      };
    }
    
    if (classification === 'visualization_feedback') {
      return {
        intent: 'visualization_feedback',
        confidence: 0.85,
      };
    }
    
    // Default to data_query if unclear
    return {
      intent: 'data_query',
      confidence: 0.8,
    };
  } catch (error) {
    console.error('Intent classification error:', error);
    // Default to data_query on error to maintain functionality
    return {
      intent: 'data_query',
      confidence: 0.5,
    };
  }
}

/**
 * Generates a personalized, friendly response for general conversation
 * Maintains memory and context from conversation history
 */
export async function generateGeneralResponse(
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<string> {
  const lowerMessage = userMessage.toLowerCase().trim();
  
  // Build conversation context for memory
  const contextMessages = conversationHistory
    .slice(-6) // Last 6 messages for context
    .map((msg) => ({
      role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: msg.role === 'user' 
        ? msg.content 
        : (msg.content || msg.summary || ''),
    }));

  // Handle specific greetings with KUDU branding
  if (/^(hi|hello|hey|greetings|good morning|good afternoon|good evening|howdy|مرحبا|السلام عليكم|أهلاً)$/i.test(lowerMessage)) {
    const isFirstGreeting = conversationHistory.length === 0;
    if (isFirstGreeting) {
      return "Hello! Welcome to KUDU's Data Analysis Assistant! 👋\n\n" +
             "I'm here to help you explore KUDU's business insights. I can analyze sales, store performance, customer data, product trends, and more.\n\n" +
             "Try asking me:\n" +
             "• 'Show me today's sales by store'\n" +
             "• 'What are our top-selling products this month?'\n" +
             "• 'Compare sales performance across regions'\n" +
             "• 'How many customers visited our stores last week?'";
    } else {
      return "Hello again! How can I help you explore KUDU's data today?";
    }
  }
  
  if (/^(thanks|thank you|thx|appreciate it|شكراً|شكرا لك)$/i.test(lowerMessage)) {
    return "You're very welcome! 😊 Happy to help you make data-driven decisions for KUDU. Feel free to ask me anything about your business data anytime!";
  }
  
  if (/^(bye|goodbye|see you|farewell|مع السلامة|وداعاً)$/i.test(lowerMessage)) {
    return "مع السلامة! Thank you for using KUDU's Data Analysis Assistant. Have a great day, and feel free to come back whenever you need insights! 👋";
  }
  
  if (/^(help|what can you do|what do you do|how does this work|مساعدة)$/i.test(lowerMessage)) {
    return "I'm KUDU's AI-powered Data Analysis Assistant! 📊\n\n" +
           "I can help you analyze KUDU's business data using our authorized database views:\n\n" +
           "📈 **Sales & Revenue Analysis**\n" +
           "• Daily, weekly, monthly sales reports\n" +
           "• Store performance comparisons\n" +
           "• Revenue trends and forecasting\n" +
           "• Order mode and sales channel analysis\n" +
           "• Sales performance with order hour details\n\n" +
           "💰 **Payroll & Financial Data**\n" +
           "• Labor summary and payroll analysis\n" +
           "• Income statement at store level\n" +
           "• Account segments and GL code analysis\n\n" +
           "📦 **Inventory Management**\n" +
           "• Inventory flow and lot details\n" +
           "• On-hand inventory and consumption\n" +
           "• Wastage analysis\n" +
           "• Location and organization tracking\n\n" +
           "🍔 **Product & Menu Analysis**\n" +
           "• Top-selling menu items\n" +
           "• Product mix and item mix analysis\n" +
           "• Product performance by category\n" +
           "• Actual cost analysis\n\n" +
           "Just ask me in plain English or Arabic, like:\n" +
           "• 'What were our sales yesterday?'\n" +
           "• 'Show me the best performing stores this month'\n" +
           "• 'Which products are selling the most?'\n" +
           "• 'Show me inventory wastage by location'\n" +
           "• 'What's our labor summary for last week?'";
  }
  
  if (/^(who are you|what are you|من أنت)$/i.test(lowerMessage)) {
    return "I'm KUDU's intelligent Data Analysis Assistant! 🤖\n\n" +
           "I'm designed specifically to help KUDU's team understand and analyze business data. I can convert your questions into SQL queries, analyze your Redshift database, and present insights with clear summaries and visualizations.\n\n" +
           "Whether you need to understand sales trends, customer behavior, product performance, or store operations, I'm here to make data analysis simple and accessible for everyone at KUDU!";
  }
  
  // Use OpenAI for other general conversation with full context
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: `You are KUDU's friendly and professional Data Analysis Assistant. KUDU is a famous food chain company in Saudi Arabia.

Your personality:
- Warm, welcoming, and professional
- Bilingual (English and Arabic) - respond naturally in the language the user uses
- Brand-aware: Always refer to KUDU with pride
- Context-aware: Remember previous conversation and reference it naturally
- Helpful: Guide users on how to ask data questions about KUDU's business

KUDU's business context:
- Food chain/restaurant business
- Multiple stores/locations
- Sales, customers, products, orders, transactions
- Store performance, regional analysis
- Menu items, inventory, operations

Maintain conversation memory and context. If the user asks follow-up questions, reference previous topics naturally.
Keep responses concise (2-4 sentences), friendly, and professional.`,
        },
        ...contextMessages,
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return completion.choices[0]?.message?.content?.trim() || 
           "I'm here to help you analyze KUDU's data! Try asking me about sales, stores, products, or customers. How can I assist you today?";
  } catch (error) {
    console.error('General response generation error:', error);
    return "I'm here to help you explore KUDU's business data! Try asking me about sales, store performance, products, or customer insights. How can I assist you today?";
  }
}

