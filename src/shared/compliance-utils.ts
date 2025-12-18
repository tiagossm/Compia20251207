// compliance-utils.ts - Utility functions for compliance calculation

import { ChecklistField } from './checklist-types';

// Extended type to include validation_rules if present
type ExtendedChecklistField = ChecklistField & {
    validation_rules?: string | Record<string, unknown>;
};

/**
 * Calculate automatic compliance status based on field value and rules
 */
export function calculateAutoCompliance(
    field: ExtendedChecklistField,
    value: unknown
): 'conforme' | 'nao_conforme' | 'na' | null {
    // If no value, return null (no auto-calculation)
    if (value === undefined || value === null || value === '') {
        return null;
    }

    // Boolean fields
    if (field.field_type === 'boolean') {
        return value === true ? 'conforme' : 'nao_conforme';
    }

    // Rating fields (1-5 scale)
    if (field.field_type === 'rating') {
        const rating = Number(value);
        if (rating >= 4) return 'conforme';
        if (rating <= 2) return 'nao_conforme';
        return null; // Neutral ratings need manual review
    }

    // Select/Radio with compliance rules
    if (field.field_type === 'select' || field.field_type === 'radio') {
        const strValue = String(value).toLowerCase();

        // Common positive answers
        if (['sim', 'yes', 'ok', 'conforme', 'adequado', 'atende'].includes(strValue)) {
            return 'conforme';
        }

        // Common negative answers
        if (['não', 'nao', 'no', 'não conforme', 'inadequado', 'não atende'].includes(strValue)) {
            return 'nao_conforme';
        }

        // N/A answers
        if (['n/a', 'na', 'não aplicável', 'não se aplica'].includes(strValue)) {
            return 'na';
        }
    }

    // Number fields with min/max thresholds - check if validation_rules exists
    if (field.field_type === 'number' && 'validation_rules' in field && field.validation_rules) {
        try {
            const rules = typeof field.validation_rules === 'string'
                ? JSON.parse(field.validation_rules)
                : field.validation_rules;

            const numValue = Number(value);

            if (rules && typeof rules === 'object') {
                const rulesObj = rules as Record<string, number>;
                if (rulesObj.min !== undefined && numValue < rulesObj.min) {
                    return 'nao_conforme';
                }
                if (rulesObj.max !== undefined && numValue > rulesObj.max) {
                    return 'nao_conforme';
                }
                if (rulesObj.min !== undefined || rulesObj.max !== undefined) {
                    return 'conforme';
                }
            }
        } catch {
            // Invalid rules, skip auto-calculation
        }
    }

    // Default: no auto-calculation
    return null;
}

/**
 * Get compliance status label in Portuguese
 */
export function getComplianceLabel(status: string): string {
    switch (status) {
        case 'conforme':
            return 'Conforme';
        case 'nao_conforme':
            return 'Não Conforme';
        case 'na':
            return 'N/A';
        case 'unanswered':
            return 'Não Respondido';
        default:
            return status;
    }
}

/**
 * Get compliance status color
 */
export function getComplianceColor(status: string): string {
    switch (status) {
        case 'conforme':
            return 'green';
        case 'nao_conforme':
            return 'red';
        case 'na':
            return 'gray';
        default:
            return 'amber';
    }
}

/**
 * Calculate overall compliance percentage
 */
export function calculateCompliancePercentage(
    statuses: Record<number, string>
): { total: number; conforme: number; naoConforme: number; na: number; percentage: number } {
    const values = Object.values(statuses);
    const total = values.length;
    const conforme = values.filter(s => s === 'conforme').length;
    const naoConforme = values.filter(s => s === 'nao_conforme').length;
    const na = values.filter(s => s === 'na').length;

    const applicable = total - na;
    const percentage = applicable > 0 ? (conforme / applicable) * 100 : 0;

    return {
        total,
        conforme,
        naoConforme,
        na,
        percentage: Math.round(percentage * 10) / 10
    };
}
