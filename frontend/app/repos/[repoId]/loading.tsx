// Loading state for the repo section
export default function RepoLoading() {
  return (
    <div className="hero-bg min-h-screen">
      <div className="border-b border-[#222222] h-14 bg-[#000000]/80" />
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-4">
        <div className="skeleton h-6 w-48 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
        <div className="skeleton h-64 rounded-xl" />
        <div className="skeleton h-48 rounded-xl" />
      </div>
    </div>
  );
}
