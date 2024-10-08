document.addEventListener('DOMContentLoaded', () => {
    const inputFile = document.getElementById('inputFile');
    const processButton = document.getElementById('processButton');
    const statusDiv = document.getElementById('status');
    const outputFormat = document.getElementById('outputFormat');

    processButton.addEventListener('click', async () => {
        if (!inputFile.files.length) {
            statusDiv.textContent = 'Please select an input file.';
            return;
        }

        const fileData = await readFile(inputFile.files[0], 'text');
        const { timeEntries, name } = parseInputFile(fileData);

        if (!validateTimeEntries(timeEntries, name)) {
            statusDiv.textContent = 'Invalid input file format. Please check your file.';
            return;
        }

        try {
            const pdfBytes = await fetchPDFFromServer();
            const filledPdfBytes = await fillPDF(timeEntries, pdfBytes, name);
            
            let outputData;
            let outputFilename;
            let outputMimeType;

            switch (outputFormat.value) {
                case 'pdf':
                    outputData = filledPdfBytes;
                    outputFilename = 'filled_timesheet.pdf';
                    outputMimeType = 'application/pdf';
                    break;
                case 'png':
                case 'jpeg':
                    const imgDataUrl = await convertPdfToImage(filledPdfBytes, outputFormat.value);
                    outputData = imgDataUrl;
                    outputFilename = `filled_timesheet.${outputFormat.value}`;
                    outputMimeType = `image/${outputFormat.value}`;
                    break;
            }

            download(outputData, outputFilename, outputMimeType);
            statusDiv.textContent = `PDF filled and downloaded as ${outputFormat.value.toUpperCase()} successfully!`;
        } catch (error) {
            console.error('Error in processing:', error);
            statusDiv.textContent = `Error: ${error.message}`;
            statusDiv.style.color = 'red';
        }
    });

    async function fetchPDFFromServer() {
        try {
            const response = await fetch('/Timesheet-Fillable.pdf');
            if (!response.ok) {
                throw new Error('Failed to fetch PDF from server');
            }
            return await response.arrayBuffer();
        } catch (error) {
            console.error('Error fetching PDF:', error);
            throw new Error('Failed to load the PDF from the server. Please try again later.');
        }
    }

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

    function parseInputFile(fileData) {
        const lines = fileData.split('\n').filter(line => line.trim() !== '');
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

    async function convertPdfToImage(pdfBytes, format) {
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

        return canvas.toDataURL(`image/${format}`, 0.8);
    }
});
