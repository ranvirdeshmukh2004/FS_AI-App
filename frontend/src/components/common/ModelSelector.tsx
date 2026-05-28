import { useAppStore } from "@/stores/appStore";

export function ModelSelector() {
  const { providers, selectedProvider, selectedModel, setProvider, setModel } =
    useAppStore();

  const currentProvider = providers.find((p) => p.id === selectedProvider);

  return (
    <div className="flex gap-2">
      <select
        value={selectedProvider}
        onChange={(e) => setProvider(e.target.value)}
        className="input-field text-sm py-1.5"
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        value={selectedModel}
        onChange={(e) => setModel(e.target.value)}
        className="input-field text-sm py-1.5"
      >
        {currentProvider?.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
