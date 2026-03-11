import { ObjectBrowser } from '../components/ObjectBrowser';

export function Home() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-2xl font-bold">S3 Browser</h1>
        <p className="mb-8 text-gray-500">
          General-purpose S3-compatible object storage browser.
        </p>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Connections</h2>
          <p className="text-gray-400">Connection management coming soon.</p>
        </div>

        <ObjectBrowser bucket="example-bucket" />
      </div>
    </div>
  );
}
