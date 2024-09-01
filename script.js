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
            statusDiv.textContent = `Error: ${error.message}`;
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
            !isNaN(parseFloat(entry.hours))
        );
    }

    async function fillPDF(timeEntries) {
        const pdfUrl = 'templates/Timesheet-Fillable.pdf';
        const pdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();

        timeEntries.forEach((entry, index) => {
            const lineNumber = index + 1;
            if (lineNumber > 14) return; // Only process up to 14 entries

            try {
                form.getTextField(`Date ${lineNumber}`).setText(entry.date);
                form.getTextField(`Time ${lineNumber}`).setText(entry.timeRange);
                form.getTextField(`Hours ${lineNumber}`).setText(entry.hours);
            } catch (error) {
                console.error(`Error filling line ${lineNumber}:`, error);
            }
        });

        return await pdfDoc.save();
    }
});
