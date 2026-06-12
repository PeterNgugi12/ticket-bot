import { useState, useMemo } from "react";

export function usePagination<T>(items: T[], itemsPerPage = 5) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return items.slice(start, start + itemsPerPage);
  }, [items, currentPage, itemsPerPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Reset to page 1 if current page exceeds total (e.g. after filtering)
  if (currentPage > totalPages) {
    setCurrentPage(1);
  }

  return { paginatedItems, currentPage, totalPages, goToPage, totalItems: items.length };
}
