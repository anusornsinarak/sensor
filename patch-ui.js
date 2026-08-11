import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Hide Navbar on mobile
code = code.replace(
  '<nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 shadow-sm z-10">',
  '<nav className="h-16 bg-white border-b border-slate-200 hidden md:flex items-center justify-between px-4 sm:px-8 shrink-0 shadow-sm z-10">'
);

// 2. Change main flex direction
code = code.replace(
  '<main className="flex-1 flex p-4 sm:p-6 gap-6 overflow-hidden relative max-w-[1600px] mx-auto w-full">',
  '<main className="flex-1 flex flex-col md:flex-row p-4 sm:p-6 gap-4 sm:gap-6 md:overflow-hidden overflow-y-auto relative max-w-[1600px] mx-auto w-full">'
);

// 3. Update aside classes to allow mobile flow and hide unwanted parts on mobile
code = code.replace(
  '<aside className="w-80 flex flex-col gap-6 h-full shrink-0 overflow-y-auto hidden md:flex">',
  '<aside className="w-full md:w-80 flex flex-col gap-4 sm:gap-6 shrink-0 md:h-full md:overflow-y-auto">'
);

// Hide Settings card on mobile
code = code.replace(
  '<div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0 space-y-4">',
  '<div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0 space-y-4 hidden md:block">'
);

// Hide Alerts Log panel on mobile
code = code.replace(
  '<div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[200px]">',
  '<div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex-1 flex-col min-h-[200px] hidden md:flex">'
);

// Update section to remove scrollbar conflict on mobile
code = code.replace(
  '<section className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-y-auto md:overflow-hidden min-w-0">',
  '<section className="flex-1 flex flex-col gap-4 sm:gap-6 md:overflow-y-auto min-w-0">'
);

fs.writeFileSync('src/App.tsx', code);
