import * as XLSX from 'xlsx';

export const parseExcelContacts = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        
        const contacts = json.map(row => {
          const name = row.Name || row.name || 'Customer';
          const number = row.Number || row.number || row.Phone || row.phone;
          if (!number) return null;
          const cleanNumber = number.toString().replace(/\D/g, '').slice(-10);
          return cleanNumber.length === 10 ? { name, number: cleanNumber } : null;
        }).filter(c => c !== null);
        
        resolve(contacts);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
