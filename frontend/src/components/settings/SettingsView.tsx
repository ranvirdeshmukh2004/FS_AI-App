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
  ExternalLink,
} from "lucide-react";

export function SettingsView() {
  const {
    providers,
    useTools,
    searchEngine,
    googleApiKey,
    googleCx,
    setUseTools,
    setSearchEngine,
    setGoogleApiKey,
    setGoogleCx,
  } = useAppStore();
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
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [googleSaved, setGoogleSaved] = useState(false);

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

  const handleSaveGoogle = () => {
    setGoogleSaved(true);
    setTimeout(() => setGoogleSaved(false), 3000);
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
              <>
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
                      DuckDuckGo
                    </button>
                    <button
                      onClick={() => setSearchEngine("google")}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                        searchEngine === "google"
                          ? "bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300"
                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                      }`}
                    >
                      Google
                    </button>
                  </div>
                </div>

                {searchEngine === "google" && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      Google Custom Search Setup
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Enter your Google Custom Search API key and Search Engine ID (CX).
                      Without these, web search falls back to DuckDuckGo.
                    </p>

                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-400">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showGoogleKey ? "text" : "password"}
                          value={googleApiKey}
                          onChange={(e) => setGoogleApiKey(e.target.value)}
                          placeholder="AIza..."
                          className="input-field text-sm pr-10"
                        />
                        <button
                          onClick={() => setShowGoogleKey(!showGoogleKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showGoogleKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-400">
                        Search Engine ID (CX)
                      </label>
                      <input
                        type="text"
                        value={googleCx}
                        onChange={(e) => setGoogleCx(e.target.value)}
                        placeholder="e.g. a1b2c3d4e5f6g7h8i"
                        className="input-field text-sm"
                      />
                    </div>

                    {googleSaved && (
                      <div className="p-2 rounded-lg flex items-center gap-2 text-xs bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300">
                        <CheckCircle2 size={14} className="flex-shrink-0" />
                        Google credentials saved!
                      </div>
                    )}

                    <button
                      onClick={handleSaveGoogle}
                      disabled={!googleApiKey.trim() || !googleCx.trim()}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      <Save size={14} />
                      Save Google Credentials
                    </button>

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        How to get these credentials:
                      </p>
                      <ol className="text-xs text-gray-500 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
                        <li>
                          Go to{" "}
                          <a
                            href="https://console.cloud.google.com/apis/credentials"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-500 hover:underline inline-flex items-center gap-0.5"
                          >
                            Google Cloud Console <ExternalLink size={10} />
                          </a>
                        </li>
                        <li>Create a project (or select existing)</li>
                        <li>
                          Enable the{" "}
                          <a
                            href="https://console.cloud.google.com/apis/library/customsearch.googleapis.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-500 hover:underline inline-flex items-center gap-0.5"
                          >
                            Custom Search API <ExternalLink size={10} />
                          </a>
                        </li>
                        <li>Go to Credentials and create an API Key</li>
                        <li>
                          Go to{" "}
                          <a
                            href="https://programmablesearchengine.google.com/controlpanel/all"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-500 hover:underline inline-flex items-center gap-0.5"
                          >
                            Programmable Search Engine <ExternalLink size={10} />
                          </a>
                        </li>
                        <li>Create a search engine, enable "Search the entire web"</li>
                        <li>Copy the Search Engine ID (CX) from the overview page</li>
                      </ol>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        Free tier: 100 queries/day. $5 per 1,000 queries after that.
                      </p>
                    </div>
                  </div>
                )}
              </>
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
