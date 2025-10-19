const HELP_DATA_URL = '/public/content/help-data.json';

export async function loadHelpData() {
  const response = await fetch(HELP_DATA_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load help data: ${response.status}`);
  }
  return response.json();
}
