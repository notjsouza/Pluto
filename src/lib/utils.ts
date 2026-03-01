import { CURRENCY_FORMATTER } from './constants';

export const formatCurrency = (amount: number): string => {
  return CURRENCY_FORMATTER.format(amount);
};

export const getProgressPercentage = (current: number, target: number): number => {
  if (target === 0) return 0;
  return Math.min((current / target) * 100, 100);
};

export const calculateSavingsRate = (income: number, expenses: number): number => {
  if (income === 0) return 0;
  return ((income - expenses) / income) * 100;
};

export const getCategoryStatus = (spent: number, budgeted: number): 'under' | 'near' | 'over' => {
  const percentage = (spent / budgeted) * 100;
  if (percentage <= 80) return 'under';
  if (percentage <= 100) return 'near';
  return 'over';
};
