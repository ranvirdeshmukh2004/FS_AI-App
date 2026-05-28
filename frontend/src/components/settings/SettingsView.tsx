import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { api } from "@/services/api";
import type { ApiKeyInfo } from "@/types";
import { Key, Trash2, Save, Eye, EyeOff } from "lucide-react";

export function SettingsView() {
  const { providers } = useAppStore();
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [formProvider, setFormProvider] = useState("");
  const [formKey, setFormKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  useEffect(() => {
    if (providers.length > 0 && !formProvider) {
      setFormProvider(providers[0].id);
    }
  }, [providers, formProvider]);

  const loadKeys = async () => {
    const data = await api.getApiKeys();
    setKeys(data);
  };

  const handleSave = async () => {
    if (!formProvider || !formKey.trim()) return;
    setSaving(true);
    await api.saveApiKey(formProvider, formKey.trim());
    setFormKey("");
    await loadKeys();
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
            <button
              onClick={handleSave}
              disabled={!formKey.trim() || saving}
              className="btn-primary flex items-center gap-2"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Key"}
            </button>
          </div>
        </div>

        <h3 className="font-semibold mb-4">Configured Keys</h3>
        {keys.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No API keys configured yet. Add one above to get started.
          </p>
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
