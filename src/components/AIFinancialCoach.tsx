'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Transaction } from '@/types/financial';
import { openaiService, EnhancedInsight, FinancialAnalysisData } from '@/lib/openai';

interface DetectedSubscription {
  id: string;
  name: string;
  amount: number;
  frequency: 'monthly' | 'yearly' | 'weekly' | 'biweekly';
  lastCharge: string;
  nextEstimatedCharge: string;
  merchantName: string;
  category: string;
  monthlyEquivalent: number;
  confidence: 'high' | 'medium' | 'low';
  transactions: Transaction[];
  detectionMethod: string;
  averageInterval?: number;
}

type FinancialInsight = EnhancedInsight;

interface AIFinancialCoachProps {
  transactions: Transaction[];
  subscriptions: DetectedSubscription[];
  totalMonthlySpending: number;
}

export default function AIFinancialCoach({ 
  transactions, 
  subscriptions, 
  totalMonthlySpending 
}: AIFinancialCoachProps) {
  const [insights, setInsights] = useState<FinancialInsight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [useAI, setUseAI] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [isAiAvailable, setIsAiAvailable] = useState(false);

  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const available = await openaiService.isAvailable();
        setIsAiAvailable(available);
      } catch (error) {
        console.error('[AIFinancialCoach] Error checking AI availability:', error);
        setIsAiAvailable(false);
      }
    };
    checkAvailability();
  }, []);

  const prepareFinancialData = useCallback((): FinancialAnalysisData => {
    const spendingByCategory: Record<string, number> = {};
    transactions.forEach(tx => {
      const category = tx.category || 'Other';
      spendingByCategory[category] = (spendingByCategory[category] || 0) + Math.abs(tx.amount);
    });

    return {
      totalMonthlySpending,
      subscriptions: subscriptions.map(sub => ({
        name: sub.name,
        amount: sub.amount,
        frequency: sub.frequency,
        category: sub.category,
        confidence: sub.confidence
      })),
      topTransactions: transactions
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 10)
        .map(tx => ({
          description: tx.description,
          amount: tx.amount,
          category: tx.category || 'Other',
          date: tx.date
        })),
      spendingByCategory
    };
  }, [transactions, subscriptions, totalMonthlySpending]);

  const generateRuleBasedInsights = useCallback((): FinancialInsight[] => {
    const generatedInsights: FinancialInsight[] = [];

    const highValueSubscriptions = subscriptions.filter(sub => sub.amount > 50);
    const lowConfidenceSubscriptions = subscriptions.filter(sub => sub.confidence === 'low');
    const duplicateCategories = findDuplicateCategories(subscriptions);

    if (highValueSubscriptions.length > 0) {
      const totalHighValue = highValueSubscriptions.reduce((sum, sub) => sum + sub.amount, 0);
      generatedInsights.push({
        id: 'high-value-subs',
        type: 'warning',
        title: 'High-Value Subscriptions Detected',
        description: `You have ${highValueSubscriptions.length} subscription(s) over $50/month, totaling $${totalHighValue.toFixed(2)}.`,
        impact: `Potential annual savings: $${(totalHighValue * 12).toFixed(2)}`,
        actionable: true,
        priority: 'high',
        category: 'subscriptions',
        source: 'rules',
        confidence: 0.9
      });
    }

    if (lowConfidenceSubscriptions.length > 0) {
      generatedInsights.push({
        id: 'review-subs',
        type: 'opportunity',
        title: 'Subscriptions Need Review',
        description: `${lowConfidenceSubscriptions.length} detected subscriptions need verification.`,
        impact: 'Ensure accurate expense tracking',
        actionable: true,
        priority: 'medium',
        category: 'subscriptions',
        source: 'rules',
        confidence: 0.8
      });
    }

    if (duplicateCategories.length > 0) {
      generatedInsights.push({
        id: 'duplicate-categories',
        type: 'opportunity',
        title: 'Multiple Services in Same Category',
        description: `You have multiple ${duplicateCategories.join(', ')} subscriptions.`,
        impact: 'Consider consolidating for potential savings',
        actionable: true,
        priority: 'medium',
        category: 'subscriptions',
        source: 'rules',
        confidence: 0.85
      });
    }

    const monthlySubscriptionTotal = subscriptions.reduce((sum, sub) => sum + sub.amount, 0);
    const subscriptionPercentage = totalMonthlySpending > 0
      ? (monthlySubscriptionTotal / totalMonthlySpending) * 100
      : 0;

    if (subscriptionPercentage > 30) {
      generatedInsights.push({
        id: 'high-subscription-ratio',
        type: 'warning',
        title: 'High Subscription-to-Spending Ratio',
        description: `Subscriptions represent ${subscriptionPercentage.toFixed(1)}% of your monthly spending.`,
        impact: 'Consider reducing recurring expenses',
        actionable: true,
        priority: 'high',
        category: 'budgeting',
        source: 'rules',
        confidence: 0.9
      });
    }

    const streamingServices = subscriptions.filter(sub => 
      sub.category === 'Streaming' && sub.amount < 20
    );
    
    if (streamingServices.length > 0) {
      generatedInsights.push({
        id: 'smart-streaming',
        type: 'achievement',
        title: 'Smart Streaming Choices',
        description: `You're keeping streaming costs reasonable with ${streamingServices.length} affordable service(s).`,
        impact: 'Good budget management!',
        actionable: false,
        priority: 'low',
        category: 'subscriptions',
        source: 'rules',
        confidence: 0.85
      });
    }

    const recommendations = generatePersonalizedRecommendations(subscriptions);
    generatedInsights.push(...recommendations);

    return generatedInsights;
  }, [subscriptions, totalMonthlySpending]);

  const findDuplicateCategories = (subs: DetectedSubscription[]): string[] => {
    const categoryCount: Record<string, number> = {};
    subs.forEach(sub => {
      categoryCount[sub.category] = (categoryCount[sub.category] || 0) + 1;
    });
    return Object.entries(categoryCount)
      .filter(([, count]) => count > 1)
      .map(([category]) => category);
  };

  const generatePersonalizedRecommendations = (
    subs: DetectedSubscription[]
  ): FinancialInsight[] => {
    const recommendations: FinancialInsight[] = [];

    const streamingSubs = subs.filter(sub => sub.category === 'Streaming');
    if (streamingSubs.length >= 3) {
      const streamingTotal = streamingSubs.reduce((sum, sub) => sum + sub.amount, 0);
      recommendations.push({
        id: 'streaming-bundle',
        type: 'recommendation',
        title: 'Consider Streaming Bundles',
        description: `You spend $${streamingTotal.toFixed(2)}/month on ${streamingSubs.length} streaming services.`,
        impact: 'Bundles could save $10-20/month',
        actionable: true,
        priority: 'medium',
        category: 'subscriptions',
        source: 'rules',
        confidence: 0.8
      });
    }

    const monthlyHighValueSubs = subs.filter(sub => 
      sub.amount > 20 && sub.frequency === 'monthly'
    );
    if (monthlyHighValueSubs.length > 0) {
      recommendations.push({
        id: 'annual-savings',
        type: 'recommendation',
        title: 'Switch to Annual Billing',
        description: `Consider annual payments for ${monthlyHighValueSubs.length} high-value subscription(s).`,
        impact: 'Typically save 10-20% with annual billing',
        actionable: true,
        priority: 'medium',
        category: 'savings',
        source: 'rules',
        confidence: 0.85
      });
    }

    return recommendations;
  };

  const handleAskAI = async () => {
    // isAiAvailable is the resolved boolean state — isAvailable() is async and must not be called here
    if (!aiQuestion.trim() || !isAiAvailable) return;
    
    setIsAskingAI(true);
    try {
      const aiData = prepareFinancialData();
      const response = await openaiService.askFinancialQuestion(aiQuestion, aiData);
      setAiResponse(response);
    } catch (error) {
      console.error('AI question failed:', error);
      setAiResponse('Sorry, I encountered an error. Please try again.');
    }
    setIsAskingAI(false);
  };

  useEffect(() => {
    const analyzeFinancialData = async () => {
      setIsAnalyzing(true);
      let generatedInsights: FinancialInsight[] = [];

      if (useAI && isAiAvailable) {
        try {
          const aiData = prepareFinancialData();          
          const aiInsights = await openaiService.generateEnhancedInsights(aiData);          
          const ruleInsights = generateRuleBasedInsights();          
          generatedInsights = [...aiInsights, ...ruleInsights];
        } catch (error) {
          console.error('[AIFinancialCoach] AI analysis failed, falling back to rules:', error);
          generatedInsights = generateRuleBasedInsights();
        }
      } else {
        generatedInsights = generateRuleBasedInsights();
      }
      setInsights(generatedInsights);
      setIsAnalyzing(false);
    };

    analyzeFinancialData();
  }, [transactions, subscriptions, totalMonthlySpending, useAI, isAiAvailable, generateRuleBasedInsights, prepareFinancialData]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-red-200 bg-red-50';
      case 'medium': return 'border-yellow-200 bg-yellow-50';
      case 'low': return 'border-green-200 bg-green-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getSourceBadge = (source: 'ai' | 'rules') => {
    if (source === 'ai') {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">AI</span>;
    }
    return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Rules</span>;
  };

  if (isAnalyzing) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900">AI Coach Analyzing...</h3>
              <p className="text-sm text-gray-600 mt-1">
                Reviewing your financial patterns and generating personalized insights
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">AI Financial Coach</h2>
        <div className="flex items-center space-x-4">
          {isAiAvailable && (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="ai-toggle"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="ai-toggle" className="ml-2 text-sm text-gray-700">
                Enable AI Analysis
              </label>
            </div>
          )}
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="text-center py-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Looking Good!</h3>
          <p className="text-gray-600">
            Your financial patterns look healthy. Keep up the great work!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className={`p-4 rounded-lg border-l-4 ${getPriorityColor(insight.priority)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-gray-700 mb-2">{insight.description}</p>
                  <p className="text-sm text-gray-600 font-medium">{insight.impact}</p>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    insight.priority === 'high' ? 'bg-red-100 text-red-800' :
                    insight.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {insight.priority.charAt(0).toUpperCase() + insight.priority.slice(1)} Priority
                  </span>
                  {getSourceBadge(insight.source)}
                  {insight.actionable && (
                    <span className="text-xs text-blue-600 font-medium">Actionable</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAiAvailable && useAI && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Ask Your AI Coach</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
              placeholder="e.g. How can I reduce my subscription spending?"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAskAI}
              disabled={isAskingAI || !aiQuestion.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              {isAskingAI ? 'Thinking...' : 'Ask'}
            </button>
          </div>
          {aiResponse && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900 whitespace-pre-wrap">{aiResponse}</p>
            </div>
          )}
        </div>
      )}

      {!isAiAvailable && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            <strong>Tip:</strong> AI financial analysis service is currently unavailable. Check back later for enhanced insights!
          </p>
        </div>
      )}
    </div>
  );
}
