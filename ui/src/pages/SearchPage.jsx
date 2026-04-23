import SearchBox from '../components/SearchBox.jsx';

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-nsw-blue px-6 py-4 flex items-center gap-3">
        <span className="text-white font-bold text-lg tracking-wide">
          Service <span className="text-nsw-red">NSW</span>
        </span>
      </header>

      <main className="flex flex-col items-center pt-20 px-4">
        <h1 className="text-2xl font-semibold text-nsw-blue mb-8">
          How can we help you?
        </h1>
        <SearchBox />
      </main>
    </div>
  );
}
