import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { api } from "@/services/api";
import type { ApiKeyInfo } from "@/types";
import {
  Key,
  Trash2,
  Save,
  Eye,
  EyeOff,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  Globe,
  Search,
} from "lucide-react";

export function SettingsView() {
  const { providers, useTools, searchEngine, setUseTools, setSearchEngine } = useAppStore();
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [formProvider, setFormProvider] = useState("");
  const [formKey, setFormKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  useEffect(() => {
    if (providers.length > 0 && !formProvider) {
      setFormProvider(providers[0].id);
    }
  }, [providers, formProvider]);

  // Clear test result when provider or key changes
  useEffect(() => {
    setTestResult(null);
    setSaveSuccess(false);
  }, [formProvider, formKey]);

  const loadKeys = async () => {
    try {
      const data = await api.getApiKeys();
      setKeys(data);
    } catch (err) {
      console.error("Failed to load keys:", err);
    }
  };

  const handleTest = async () => {
    if (!formProvider || !formKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testApiKey(formProvider, formKey.trim());
      setTestResult(result);
    } catch (err) {
      setTestResult({
        valid: false,
        message: err instanceof Error ? err.message : "Test failed",
      });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    if (!formProvider || !formKey.trim()) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await api.saveApiKey(formProvider, formKey.trim());
      setFormKey("");
      setSaveSuccess(true);
      setTestResult(null);
      await loadKeys();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save key:", err);
    }
    setSaving(false);
  };

  const handleDelete = async (provider: string) => {
    await api.deleteApiKey(provider);
    await loadKeys();
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Key size={24} />
          API Key Settings
        </h2>

        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 mb-8 border border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold mb-4">Add / Update API Key</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Provider</label>
              <select
                value={formProvider}
                onChange={(e) => setFormProvider(e.target.value)}
                className="input-field"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="sk-..."
                  className="input-field pr-10"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                  testResult.valid
                    ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                    : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                }`}
              >
                {testResult.valid ? (
                  <CheckCircle2 size={16} className="flex-shrink-0" />
                ) : (
                  <XCircle size={16} className="flex-shrink-0" />
                )}
                {testResult.message}
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 rounded-lg flex items-center gap-2 text-sm bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300">
                <CheckCircle2 size={16} className="flex-shrink-0" />
                API key saved successfully!
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleTest}
                disabled={!formKey.trim() || testing}
                className="btn-secondary flex items-center gap-2"
              >
                {testing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FlaskConical size={16} />
                )}
                {testing ? "Testing..." : "Test Key"}
              </button>
              <button
                onClick={handleSave}
                disabled={!formKey.trim() || saving}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {saving ? "Saving..." : "Save Key"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 mb-8 border border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Wrench size={18} />
            ReAct Tools
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            When enabled, the AI can use web search and Wikipedia to find information it doesn't have in its training data.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe size={16} />
                <span className="text-sm font-medium">Enable Tools</span>
              </div>
              <button
                onClick={() => setUseTools(!useTools)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  useTools
                    ? "bg-primary-500"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    useTools ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {useTools && (
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Search size={16} />
                  Search Engine
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSearchEngine("duckduckgo")}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                      searchEngine === "duckduckgo"
                        ? "bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                    }`}
                  >
                    🦆 DuckDuckGo
                  </button>
                  <button
                    onClick={() => setSearchEngine("google")}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                      searchEngine === "google"
                        ? "bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                    }`}
                  >
                    🔍 Google
                  </button>
                </div>
                {searchEngine === "google" && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    Google requires a Custom Search API key and CX ID configured server-side. Falls back to DuckDuckGo if not set.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <h3 className="font-semibold mb-4">Configured Keys</h3>
        {keys.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Key size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              No API keys configured yet. Add one above to get started.
            </p>
            <p className="text-xs mt-1">
              Tip: Use the "Test Key" button to verify your key works before saving.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-800"
              >
                <div>
                  <span className="font-medium">
                    {providers.find((p) => p.id === k.provider)?.name || k.provider}
                  </span>
                  <span className="ml-3 text-sm text-gray-400 font-mono">
                    {k.keyPreview}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(k.provider)}
                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
