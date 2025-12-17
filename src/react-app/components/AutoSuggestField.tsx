import React, { useState, useEffect, useRef } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/utils/auth';

interface AutoSuggestOption {
  value: string;
  label: string;
  email?: string;
}

interface AutoSuggestFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string, email?: string) => void;
  placeholder: string;
  required?: boolean;
  apiEndpoint: string;
  onAddNew?: () => void;
  addNewText?: string;
  showEmail?: boolean;
  className?: string;
}

export default function AutoSuggestField({
  label,
  name,
  value,
  onChange,
  placeholder,
  required = false,
  apiEndpoint,
  onAddNew,
  addNewText = "Adicionar novo",
  showEmail = false,
  className = ""
}: AutoSuggestFieldProps) {
  const [suggestions, setSuggestions] = useState<AutoSuggestOption[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions based on input
  const fetchSuggestions = async (searchText: string) => {
    if (searchText.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetchWithAuth(`${apiEndpoint}?search=${encodeURIComponent(searchText)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Erro ao buscar sugestões:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);

    if (newValue.trim()) {
      fetchSuggestions(newValue.trim());
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: AutoSuggestOption) => {
    setInputValue(suggestion.value);
    onChange(suggestion.value, suggestion.email);
    setShowSuggestions(false);
  };

  // Handle input focus
  const handleFocus = () => {
    if (inputValue.trim() && suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update input value when prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  return (
    <div className={className}>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              id={name}
              name={name}
              value={inputValue}
              onChange={handleInputChange}
              onFocus={handleFocus}
              required={required}
              placeholder={placeholder}
              className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="off"
            />

            {loading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            )}

            {!loading && suggestions.length > 0 && (
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            )}
          </div>

          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="flex items-center px-3 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              title={addNewText}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSuggestionSelect(suggestion)}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{suggestion.label}</span>
                  {showEmail && suggestion.email && (
                    <span className="text-xs text-slate-500">{suggestion.email}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
