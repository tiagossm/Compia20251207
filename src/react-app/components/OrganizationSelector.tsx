import { useOrganization } from "@/react-app/context/OrganizationContext";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export function OrganizationSelector() {
  const { selectedOrganization, availableOrganizations, setSelectedOrganization, isLoading } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading) return <div className="h-9 w-32 bg-slate-100 rounded animate-pulse" />;

  if (!selectedOrganization) return null;

  // If only 1 org, just show static badge or nothing?
  // User wanted explicit visual, so let's show it even if single.

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm font-medium transition-colors"
      >
        <Building2 size={16} className="text-slate-400" />
        <span className="max-w-[150px] truncate">{selectedOrganization.name}</span>
        {availableOrganizations.length > 1 && (
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isOpen && availableOrganizations.length > 1 && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-50">
          <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Trocar Organização
          </div>
          {availableOrganizations.map(org => (
            <button
              key={org.id}
              onClick={() => {
                setSelectedOrganization(org);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors
                 ${selectedOrganization.id === org.id ? 'bg-primary-50 text-primary-700' : 'text-slate-700'}
               `}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{org.name}</span>
                <span className="text-[10px] text-slate-500 uppercase">{org.type === 'master' ? 'Consultoria' : 'Cliente'}</span>
              </div>
              {selectedOrganization.id === org.id && <Check size={14} className="text-primary-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
