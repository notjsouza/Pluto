"use client";

import { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '../lib/utils';
import { PlaidTransaction } from '../lib/plaid';

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
  transactions: PlaidTransaction[];
  detectionMethod: string;
  averageInterval?: number;
}

interface SubscriptionDetectorProps {
  transactions: PlaidTransaction[];
  onSubscriptionsDetected?: (subscriptions: DetectedSubscription[]) => void;
}

const normalizeMerchant = (name: string): string => {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(llc|inc|corp|ltd|company|co|payment|paypal|sq|autopay)\b/g, '')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const merchantSimilarity = (name1: string, name2: string): number => {
  const normalized1 = normalizeMerchant(name1);
  const normalized2 = normalizeMerchant(name2);
  
  if (normalized1 === normalized2) return 1.0;

  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.8;
  }
  
  const words1 = normalized1.split(' ').filter(w => w.length > 2);
  const words2 = normalized2.split(' ').filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const commonWords = words1.filter(w => words2.includes(w)).length;
  const totalWords = Math.max(words1.length, words2.length);
  
  return commonWords / totalWords;
};

const amountSimilarity = (amount1: number, amount2: number): number => {
  const diff = Math.abs(amount1 - amount2);
  const avgAmount = (amount1 + amount2) / 2;
  
  if (diff === 0) return 1.0;
  if (avgAmount < 50 && diff <= 1) return 0.9;
  if (diff / avgAmount <= 0.05) return 0.8;
  if (diff / avgAmount <= 0.1) return 0.6;
  
  return 0;
};

const daysBetween = (date1: string, date2: string): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.abs((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
};

const detectFrequency = (intervals: number[]): { frequency: DetectedSubscription['frequency'], confidence: number } => {
  if (intervals.length === 0) return { frequency: 'monthly', confidence: 0 };
  
  const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
  const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const consistency = 1 - Math.min(stdDev / avgInterval, 1);
  
  if (avgInterval >= 350 && avgInterval <= 380) {
    return { frequency: 'yearly', confidence: consistency };
  } else if (avgInterval >= 25 && avgInterval <= 35) {
    return { frequency: 'monthly', confidence: consistency };
  } else if (avgInterval >= 36 && avgInterval <= 40) {
    return { frequency: 'monthly', confidence: consistency * 0.85 };
  } else if (avgInterval >= 13 && avgInterval <= 16) {
    return { frequency: 'biweekly', confidence: consistency };
  } else if (avgInterval >= 6 && avgInterval <= 8) {
    return { frequency: 'weekly', confidence: consistency };
  }
  
  return { frequency: 'monthly', confidence: 0.3 };
};

const SUBSCRIPTION_PATTERNS = {
  streaming: ['netflix', 'spotify', 'hulu', 'disney plus', 'youtube premium', 'apple music', 'amazon prime video', 'paramount plus', 'hbo max'],
  software: ['adobe creative cloud', 'microsoft 365', 'office 365', 'google workspace', 'dropbox pro', 'slack premium', 'zoom pro', 'github pro', 'grammarly premium', 'notion pro'],
  education: ['chegg study subscription', 'coursera plus', 'udemy pro', 'duolingo plus'],
  gaming: ['discord nitro', 'steam', 'xbox live', 'playstation plus', 'nintendo online'],
  cloud: ['icloud storage', 'onedrive', 'google drive', 'dropbox'],
  fitness: ['planet fitness', 'anytime fitness', 'gym membership'],
  news: ['new york times', 'washington post', 'wall street journal']
};

const categorizeSubscription = (merchantName: string): string => {
  const name = merchantName.toLowerCase();
  
  for (const [category, keywords] of Object.entries(SUBSCRIPTION_PATTERNS)) {
    if (keywords.some(keyword => name.includes(keyword))) {
      return category.charAt(0).toUpperCase() + category.slice(1);
    }
  }
  
  if (name.includes('subscription') || name.includes('premium') || name.includes('plus')) {
    return 'Subscription';
  }
  
  return 'Other';
};

export default function HybridSubscriptionDetector({ transactions, onSubscriptionsDetected }: SubscriptionDetectorProps) {
  const [detectedSubscriptions, setDetectedSubscriptions] = useState<DetectedSubscription[]>([]);
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0);

  const onSubscriptionsDetectedRef = useRef(onSubscriptionsDetected);
  useEffect(() => { onSubscriptionsDetectedRef.current = onSubscriptionsDetected; });

  useEffect(() => {
    const detectSubscriptions = () => {

      if (transactions.length === 0) return;

      // In Plaid: positive amounts = expenses, negative = income
      const expenses = transactions.filter(t => t.amount > 0);
      const subscriptions: DetectedSubscription[] = [];
      const processedTransactions = new Set<string>();
      
      for (let i = 0; i < expenses.length; i++) {
        const transaction1 = expenses[i];
        if (processedTransactions.has(transaction1.transaction_id)) continue;
        
        const similarTransactions = [transaction1];
        
        for (let j = i + 1; j < expenses.length; j++) {
          const transaction2 = expenses[j];
          if (processedTransactions.has(transaction2.transaction_id)) continue;
          
          const merchantSim = merchantSimilarity(transaction1.name, transaction2.name);
          const amountSim = amountSimilarity(Math.abs(transaction1.amount), Math.abs(transaction2.amount));
          
          if (merchantSim >= 0.6 && amountSim >= 0.5) {
            similarTransactions.push(transaction2);
          }
        }
        
        similarTransactions.forEach(t => processedTransactions.add(t.transaction_id));
        
        if (similarTransactions.length >= 2) {
          
          const sortedTransactions = similarTransactions.sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          
          const intervals = [];
          for (let k = 1; k < sortedTransactions.length; k++) {
            const interval = daysBetween(sortedTransactions[k-1].date, sortedTransactions[k].date);
            intervals.push(interval);
          }
          
          const { frequency, confidence: freqConfidence } = detectFrequency(intervals);
          
          const countDampener = similarTransactions.length === 2 ? 0.7
                              : similarTransactions.length === 3 ? 0.85
                              : 1.0;
          const adjustedConfidence = freqConfidence * countDampener;

          if (adjustedConfidence > 0.3) {
            const avgAmount = similarTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / similarTransactions.length;
            const lastTransaction = sortedTransactions[sortedTransactions.length - 1];
            
            const monthlyEquivalent = frequency === 'weekly' ? avgAmount * 4.33 :
                                   frequency === 'biweekly' ? avgAmount * 2.17 :
                                   frequency === 'yearly' ? avgAmount / 12 :
                                   avgAmount;
            
            const nextChargeDate = new Date(lastTransaction.date);
            const intervalDays = frequency === 'weekly' ? 7 :
                               frequency === 'biweekly' ? 14 :
                               frequency === 'yearly' ? 365 : 30;
            nextChargeDate.setDate(nextChargeDate.getDate() + intervalDays);
            
            subscriptions.push({
              id: `fuzzy-${subscriptions.length}`,
              name: transaction1.name.toUpperCase(),
              amount: avgAmount,
              frequency,
              lastCharge: lastTransaction.date,
              nextEstimatedCharge: nextChargeDate.toISOString().split('T')[0],
              merchantName: transaction1.name,
              category: categorizeSubscription(transaction1.name),
              monthlyEquivalent,
              confidence: adjustedConfidence > 0.7 ? 'high' : adjustedConfidence > 0.5 ? 'medium' : 'low',
              transactions: sortedTransactions,
              detectionMethod: `Fuzzy Pattern (${similarTransactions.length} transactions)`,
              averageInterval: intervals.reduce((sum, i) => sum + i, 0) / intervals.length
            });
          }
        }
      }
      
      expenses.forEach(transaction => {
        const alreadyDetected = subscriptions.some(sub => 
          sub.transactions.some(t => t.transaction_id === transaction.transaction_id)
        );
        if (alreadyDetected) {
          return;
        }
        
        const merchantName = normalizeMerchant(transaction.name);
        const amount = Math.abs(transaction.amount);
        
        let subscriptionScore = 0;
        const scoreBreakdown: string[] = [];
        
        const oneTimePurchaseKeywords = [
          'textbook', 'book', 'furniture', 'bed bath', 'movie ticket', 'cinema', 'theater',
          'day pass', 'parking permit', 'meal plan', 'top-up', 'venmo', 'paypal', 'zelle',
          'uber', 'lyft', 'doordash', 'grubhub', 'rides', 'delivery'
        ];
        
        const isOneTimePurchase = oneTimePurchaseKeywords.some(keyword => 
          merchantName.includes(keyword)
        );
        
        if (isOneTimePurchase) {
          return;
        }

        const isKnownService = Object.entries(SUBSCRIPTION_PATTERNS).find(([, keywords]) => 
          keywords.some(service => merchantName.includes(service))
        );
        if (isKnownService) {
          subscriptionScore += 0.8;
          scoreBreakdown.push(`Known ${isKnownService[0]} service (+0.8)`);
        }
        
        const confirmedServices = ['spotify', 'netflix', 'adobe creative cloud', 'icloud storage', 'grammarly premium', 'discord nitro'];
        if (confirmedServices.some(service => merchantName.includes(service))) {
          subscriptionScore += 0.6;
          scoreBreakdown.push('Confirmed subscription service (+0.6)');
        }
        
        if (merchantName.includes('subscription')) {
          subscriptionScore += 0.7;
          scoreBreakdown.push('Contains "subscription" (+0.7)');
        }
        if (merchantName.includes('premium') && !merchantName.includes('student')) {
          subscriptionScore += 0.3;
          scoreBreakdown.push('Contains "premium" (+0.3)');
        }
        if (merchantName.includes('plus') && !merchantName.includes('student')) {
          subscriptionScore += 0.3;
          scoreBreakdown.push('Contains "plus" (+0.3)');
        }
        if (merchantName.includes('pro') && !merchantName.includes('student')) {
          subscriptionScore += 0.3;
          scoreBreakdown.push('Contains "pro" (+0.3)');
        }
        if (merchantName.includes('membership')) {
          subscriptionScore += 0.4;
          scoreBreakdown.push('Contains "membership" (+0.4)');
        }
        if (merchantName.includes('student') && (merchantName.includes('subscription') || merchantName.includes('premium'))) {
          subscriptionScore += 0.5;
          scoreBreakdown.push('Student subscription service (+0.5)');
        }
        
        if ((merchantName.includes('storage') || merchantName.includes('cloud')) && 
            (merchantName.includes('subscription') || merchantName.includes('premium') || merchantName.includes('pro'))) {
          subscriptionScore += 0.3;
          scoreBreakdown.push('Cloud/storage service (+0.3)');
        }
        
        if (amount >= 1.99 && amount <= 299.99) {
          subscriptionScore += 0.2;
          scoreBreakdown.push('Typical subscription amount range (+0.2)');
        }
        
        const commonAmounts = [1.99, 2.99, 4.99, 7.99, 9.99, 12.99, 14.99, 19.99, 24.99, 29.99, 39.99, 49.99, 99.99];
        if (commonAmounts.includes(amount)) {
          subscriptionScore += 0.3;
          scoreBreakdown.push(`Common subscription amount $${amount} (+0.3)`);
        }
        
        if (amount % 1 === 0 || amount.toString().endsWith('.99')) {
          subscriptionScore += 0.1;
          scoreBreakdown.push('Round/psychological pricing (+0.1)');
        }
        
        if (subscriptionScore >= 0.8) {
          const nextChargeDate = new Date(transaction.date);
          nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
          
          const confidenceLevel: DetectedSubscription['confidence'] = 
            subscriptionScore > 0.8 ? 'high' : subscriptionScore > 0.6 ? 'medium' : 'low';
          
          const subscription = {
            id: `heuristic-${subscriptions.length}`,
            name: transaction.name.toUpperCase(),
            amount,
            frequency: 'monthly' as const,
            lastCharge: transaction.date,
            nextEstimatedCharge: nextChargeDate.toISOString().split('T')[0],
            merchantName: transaction.name,
            category: categorizeSubscription(transaction.name),
            monthlyEquivalent: amount,
            confidence: confidenceLevel,
            transactions: [transaction],
            detectionMethod: `Heuristic Analysis (${(subscriptionScore * 100).toFixed(0)}% match)`,
            averageInterval: 30
          };
          
          subscriptions.push(subscription);
          processedTransactions.add(transaction.transaction_id);
          
        }
      });

      const uniqueSubscriptions = subscriptions.reduce((acc, sub) => {
        const existing = acc.find(existing => 
          merchantSimilarity(existing.merchantName, sub.merchantName) > 0.7 &&
          amountSimilarity(existing.amount, sub.amount) > 0.7
        );
        
        if (!existing) {
          acc.push(sub);
        } else {
          if (sub.confidence === 'high' && existing.confidence !== 'high') {
            const index = acc.indexOf(existing);
            acc[index] = sub;
          }
        }
        
        return acc;
      }, [] as DetectedSubscription[]);

      uniqueSubscriptions.sort((a, b) => {
        const confidenceOrder = { high: 3, medium: 2, low: 1 };
        const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
        if (confDiff !== 0) return confDiff;
        return b.monthlyEquivalent - a.monthlyEquivalent;
      });

      setDetectedSubscriptions(uniqueSubscriptions);
      setTotalMonthlyCost(uniqueSubscriptions.reduce((sum, sub) => sum + sub.monthlyEquivalent, 0));
      
      if (onSubscriptionsDetectedRef.current) {
        onSubscriptionsDetectedRef.current(uniqueSubscriptions);
      }
    };

    detectSubscriptions();
  }, [transactions]);

  if (detectedSubscriptions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Subscription Detection</h2>
        </div>
        <div className="text-center py-8">
          <div className="text-gray-500 mb-2">Analyzing transaction patterns...</div>
          <p className="text-sm text-gray-400">
            Using fuzzy matching and ML heuristics to find subscriptions
          </p>
        </div>
      </div>
    );
  }

  const annualSavingsOpportunity = totalMonthlyCost * 12;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Detected Subscriptions</h2>
        <div className="text-right">
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(totalMonthlyCost)}/month
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {detectedSubscriptions.map((subscription) => (
          <div
            key={subscription.id}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow relative"
          >
            <div className="flex items-start justify-between pb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">
                    {subscription.name}
                  </h3>
                </div>

                <div className="text-xs text-gray-500 mb-1">
                  Next charge: {new Date(subscription.nextEstimatedCharge).toLocaleDateString()}
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900">
                  {formatCurrency(subscription.monthlyEquivalent)}
                </div>
                <div className="text-xs text-gray-500">per month</div>
              </div>
            </div>
            <span className="absolute bottom-2 right-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
              {subscription.category}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-semibold text-blue-900">Smart Insights</h3>
        </div>
        <p className="text-sm text-blue-800">
          Our hybrid detection system found {detectedSubscriptions.length} subscriptions.
          You could potentially save {formatCurrency(annualSavingsOpportunity)} annually
          by reviewing and optimizing these recurring payments.
        </p>
      </div>
    </div>
  );
}
