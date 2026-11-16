/** Export the displayed page and escape spreadsheet formula prefixes in user data. */
export function exportAdminCsv(filename: string, headings: string[], rows: Array<Array<string | number | null>>) {
  function cell(value: string | number | null) {
    const text = String(value ?? "");
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@\t\r\n]/u.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  const csv = [headings, ...rows].map(row => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
