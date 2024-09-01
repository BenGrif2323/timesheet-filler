document.addEventListener('DOMContentLoaded', () => {
    const csvFile = document.getElementById('csvFile');
    const processButton = document.getElementById('processButton');
    const statusDiv = document.getElementById('status');

    processButton.addEventListener('click', async () => {
        if (!csvFile.files.length) {
            statusDiv.textContent = 'Please select a CSV file.';
            return;
        }

        const file = csvFile.files[0];
        const csvData = await readFile(file);
        const timeEntries = parseCSV(csvData);

        if (!validateTimeEntries(timeEntries)) {
            statusDiv.textContent = 'Invalid CSV format. Please check your file.';
            return;
        }

        try {
            const pdfBytes = await fillPDF(timeEntries);
            download(pdfBytes, 'filled_timesheet.pdf', 'application/pdf');
            statusDiv.textContent = 'PDF filled and downloaded successfully!';
        } catch (error) {
            console.error('Error in processing:', error);
            statusDiv.textContent = `Error: ${error.message}`;
            statusDiv.style.color = 'red';
        }
    });

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (error) => reject(error);
            reader.readAsText(file);
        });
    }

    function parseCSV(csvData) {
        const lines = csvData.split('\n').filter(line => line.trim() !== '');
        return lines.map(line => {
            const [date, timeRange, hours] = line.split(',').map(item => item.trim());
            return { date, timeRange, hours };
        });
    }

    function validateTimeEntries(timeEntries) {
        return timeEntries.every(entry => 
            entry.date && entry.timeRange && entry.hours &&
            (entry.hours === 'X' || !isNaN(parseFloat(entry.hours)))
        );
    }

    async function fillPDF(timeEntries) {
        const pdfUrl = 'Timesheet-Fillable.pdf';
        console.log('Loading PDF from:', pdfUrl);

        let pdfBytes;
        try {
            const response = await fetch(pdfUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            pdfBytes = await response.arrayBuffer();
            console.log('PDF read successfully, size:', pdfBytes.byteLength, 'bytes');
        } catch (error) {
            console.error('Error reading PDF:', error);
            throw new Error(`Failed to read the PDF file. Error: ${error.message}`);
        }

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
        let totalHours = 0;

        timeEntries.forEach((entry, index) => {
            const lineNumber = index + 1;
            if (lineNumber > 14) return; // Only process up to 14 entries

            try {
                form.getTextField(`Date ${lineNumber}`).setText(entry.date);
                form.getTextField(`Time ${lineNumber}`).setText(entry.timeRange);
                form.getTextField(`Hours ${lineNumber}`).setText(entry.hours);
                
                console.log(`Filled line ${lineNumber}:`, entry);

                // Add hours to total if it's a valid number
                if (entry.hours !== 'X') {
                    const hours = parseFloat(entry.hours);
                    if (!isNaN(hours)) {
                        totalHours += hours;
                    }
                }
            } catch (error) {
                console.error(`Error filling line ${lineNumber}:`, error);
            }
        });

        // Fill in the total hours
        try {
            form.getTextField('Total Hours').setText(totalHours.toFixed(2));
            console.log('Total hours filled:', totalHours.toFixed(2));
        } catch (error) {
            console.error('Error filling Total Hours:', error);
        }

        console.log('PDF filling completed, saving...');
        return await pdfDoc.save();
    }
});
