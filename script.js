document.addEventListener('DOMContentLoaded', () => {
    const txtFile = document.getElementById('txtFile');
    const pdfFile = document.getElementById('pdfFile');
    const processButton = document.getElementById('processButton');
    const statusDiv = document.getElementById('status');

    processButton.addEventListener('click', async () => {
        if (!txtFile.files.length || !pdfFile.files.length) {
            statusDiv.textContent = 'Please select both TXT and PDF files.';
            return;
        }

        const txtData = await readFile(txtFile.files[0], 'text');
        const { timeEntries, name } = parseTXT(txtData);

        if (!validateTimeEntries(timeEntries, name)) {
            statusDiv.textContent = 'Invalid TXT format. Please check your file.';
            return;
        }

        try {
            const pdfBytes = await readFile(pdfFile.files[0], 'arrayBuffer');
            const filledPdfBytes = await fillPDF(timeEntries, pdfBytes, name);
            const jpgDataUrl = await convertPdfToJpg(filledPdfBytes);
            download(jpgDataUrl, 'filled_timesheet.jpg', 'image/jpeg');
            statusDiv.textContent = 'PDF filled, converted to JPG, and downloaded successfully!';
        } catch (error) {
            console.error('Error in processing:', error);
            statusDiv.textContent = `Error: ${error.message}`;
            statusDiv.style.color = 'red';
        }
    });

    function readFile(file, readAs) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (error) => reject(error);
            if (readAs === 'text') {
                reader.readAsText(file);
            } else if (readAs === 'arrayBuffer') {
                reader.readAsArrayBuffer(file);
            }
        });
    }

    function parseTXT(txtData) {
        const lines = txtData.split('\n').filter(line => line.trim() !== '');
        const name = lines.pop().trim(); // Extract the name from the last line
        const timeEntries = lines.map(line => {
            const [date, timeRange, hours] = line.split(',').map(item => item.trim());
            return { date, timeRange, hours };
        });
        return { timeEntries, name };
    }

    function validateTimeEntries(timeEntries, name) {
        return timeEntries.every(entry => 
            entry.date && entry.timeRange && entry.hours &&
            (entry.hours === 'X' || !isNaN(parseFloat(entry.hours)))
        ) && name.trim() !== '';
    }

    async function fillPDF(timeEntries, pdfBytes, name) {
        console.log('Loading PDF, size:', pdfBytes.byteLength, 'bytes');

        let pdfDoc;
        try {
            pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
            console.log('PDF loaded successfully, page count:', pdfDoc.getPageCount());
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw new Error(`Failed to load the PDF document. Error: ${error.message}`);
        }

        const form = pdfDoc.getForm();
        console.log('Form fields found:', form.getFields().map(f => f.getName()));

        // Calculate total hours
        const totalHours = timeEntries.reduce((total, entry) => {
            if (entry.hours !== 'X') {
                const hours = parseFloat(entry.hours);
                return !isNaN(hours) ? total + hours : total;
            }
            return total;
        }, 0);

        timeEntries.forEach((entry, index) => {
            const lineNumber = index + 1;
            if (lineNumber > 14) return; // Only process up to 14 entries

            try {
                form.getTextField(`Date ${lineNumber}`).setText(entry.date);
                form.getTextField(`Time ${lineNumber}`).setText(entry.timeRange === 'X' ? '---' : entry.timeRange);
                form.getTextField(`Hours ${lineNumber}`).setText(entry.hours === 'X' ? '---' : 
                    (Number.isInteger(parseFloat(entry.hours)) ? `${entry.hours}.0` : entry.hours));
                
                console.log(`Filled line ${lineNumber}:`, entry);
            } catch (error) {
                console.error(`Error filling line ${lineNumber}:`, error);
            }
        });

        // Fill in the total hours
        try {
            form.getTextField('Total').setText(totalHours.toFixed(2));
            console.log('Total hours filled:', totalHours.toFixed(2));
        } catch (error) {
            console.error('Error filling Total Hours:', error);
        }

        // Fill in the name
        try {
            form.getTextField('Name').setText(name);
            console.log('Name filled:', name);
        } catch (error) {
            console.error('Error filling Name:', error);
        }

        console.log('PDF filling completed, saving...');
        return await pdfDoc.save();
    }

    async function convertPdfToJpg(pdfBytes) {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const scale = 2;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        return canvas.toDataURL('image/jpeg', 0.8);
    }
});
