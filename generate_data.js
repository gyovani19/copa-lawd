const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'Membros b8415a3d3d19462690637c8ea91a09e3_all.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

// Parse CSV with full quoted newline support
function parseCSV(content) {
    const records = [];
    let currentRecord = [];
    let currentField = '';
    let inQuotes = false;
    
    let i = 0;
    while (i < content.length) {
        const char = content[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            currentRecord.push(currentField);
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && content[i + 1] === '\n') {
                i++; // Skip \n
            }
            currentRecord.push(currentField);
            currentField = '';
            if (currentRecord.some(field => field.trim().length > 0)) {
                records.push(currentRecord);
            }
            currentRecord = [];
        } else {
            currentField += char;
        }
        i++;
    }
    
    // Add last record if it exists
    if (currentField || currentRecord.length > 0) {
        currentRecord.push(currentField);
        if (currentRecord.some(field => field.trim().length > 0)) {
            records.push(currentRecord);
        }
    }
    
    if (records.length === 0) return [];
    
    const headers = records[0].map(h => h.trim());
    const result = [];
    
    for (let r = 1; r < records.length; r++) {
        const row = records[r];
        const record = {};
        headers.forEach((header, idx) => {
            record[header] = row[idx] ? row[idx].trim() : '';
        });
        result.push(record);
    }
    
    return result;
}

function formatItemName(filename) {
    const nameWithoutExt = path.basename(filename, path.extname(filename));
    return nameWithoutExt
        .split(/[-_]/)
        .map(word => {
            const lower = word.toLowerCase();
            if (['mpse', 'ccet', 'ufs', 'lawd'].includes(lower)) {
                return word.toUpperCase();
            }
            if (lower === '2anos') {
                return '2 Anos';
            }
            if (lower === 'ufsbr') {
                return 'UFS BR';
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

const records = parseCSV(csvContent);
const items = [];
let currentId = 1;

// 1. Process Members
const membrosDir = path.join(__dirname, 'Membros');
if (fs.existsSync(membrosDir)) {
    const folders = fs.readdirSync(membrosDir);
    
    records.forEach((record) => {
        const rawName = record['Name'];
        if (!rawName) return;
        const cleanName = rawName.trim();
        
        // Find folder matching cleanName
        const folderName = folders.find(f => f.trim().toLowerCase() === cleanName.toLowerCase());
        
        let imagePath = '';
        if (folderName) {
            const folderFullPath = path.join(membrosDir, folderName);
            if (fs.statSync(folderFullPath).isDirectory()) {
                const files = fs.readdirSync(folderFullPath);
                const imageFile = files.find(file => {
                    const ext = path.extname(file).toLowerCase();
                    return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
                });
                if (imageFile) {
                    imagePath = `Membros/${folderName}/${imageFile}`;
                }
            }
        }
        
        if (cleanName && record['Status'] !== 'desvinculado') {
            items.push({
                id: currentId++,
                category: 'membro',
                name: cleanName === 'Pedro Souza' ? 'Pedro Lucas' : cleanName,
                fullName: record['Nome Completo'] || cleanName,
                email: record['Email'] || '',
                phone: record['Phone'] || '',
                birthday: record['Aniversário'] || '',
                status: record['Status'] || 'membro efetivo',
                techs: record['Techs'] ? record['Techs'].split(',').map(t => t.trim()).filter(Boolean) : [],
                areasOfActivity: record['Áreas de atuação'] || '',
                interests: record['Áreas de interesse'] || '',
                projects: record['Projetos'] || '',
                image: imagePath || 'assets/placeholder.png',
                isRectangular: false
            });
        }
    });
}

// 2. Process Eventos
const eventosDir = path.join(__dirname, 'Eventos');
if (fs.existsSync(eventosDir)) {
    const files = fs.readdirSync(eventosDir);
    files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            items.push({
                id: currentId++,
                category: 'evento',
                name: formatItemName(file),
                fullName: formatItemName(file),
                email: '',
                phone: '',
                birthday: '',
                status: 'Evento',
                techs: [],
                areasOfActivity: '',
                interests: '',
                projects: '',
                image: `Eventos/${file}`,
                isRectangular: true
            });
        }
    });
}

// 3. Process Lugares
const lugaresDir = path.join(__dirname, 'Lugares');
if (fs.existsSync(lugaresDir)) {
    const files = fs.readdirSync(lugaresDir);
    files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            items.push({
                id: currentId++,
                category: 'lugar',
                name: formatItemName(file),
                fullName: formatItemName(file),
                email: '',
                phone: '',
                birthday: '',
                status: 'Lugar',
                techs: [],
                areasOfActivity: '',
                interests: '',
                projects: '',
                image: `Lugares/${file}`,
                isRectangular: true
            });
        }
    });
}

// Generate the output JavaScript file
const outputContent = `// Auto-generated members data for Copa LAWD Sticker Album
const MEMBROS = ${JSON.stringify(items, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'membros_data.js'), outputContent, 'utf8');
console.log(`Successfully generated membros_data.js with ${items.length} items.`);
