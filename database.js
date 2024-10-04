const mysql = require('mysql2/promise');

// Create the MySQL connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '@N55917',
    database: 'attendance_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Utility function to normalize the roll number
function normalizeRollNumber(rollNo) {
    return rollNo.replace(/080[!I]/g, '0801');
}

// Utility function to count occurrences of P's, A's, and .s in attendance data
function countClasses(attendanceString) {
    const totalPresent = (attendanceString.match(/P/g) || []).length;
    const totalClassesHeld = (attendanceString.match(/[PA.]/g) || []).length;
    return { totalPresent, totalClassesHeld };
}

// Function to create a table for the subject if it doesn't exist
async function createTableForSubject(subjectName) {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${mysql.escapeId(subjectName)} (
            roll_no VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255),
            total_classes_attended INT,
            total_classes_held INT
        )
    `;

    try {
        // Use a connection from the pool and execute the query
        const conn = await pool.getConnection();
        await conn.query(createTableQuery);
        conn.release();
        console.log(`Table for ${subjectName} created or already exists.`);
    } catch (err) {
        console.error('Error creating table:', err);
        throw err;
    }
}

// Function to insert or update a student's data into the subject table
async function insertStudentData(subjectName, students) {
    let conn;
    try {
        // Get a connection from the pool
        conn = await pool.getConnection();

        // Loop through each student and insert their data
        for (const student of students) {
            const { rollNumber, studentName, attendedClasses, totalClasses } = student;

            // Corrected insert query for 4 columns
            const insertQuery = `
                INSERT INTO \`${subjectName}\` (roll_no, name, total_classes_attended, total_classes_held)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                total_classes_attended = VALUES(total_classes_attended),
                total_classes_held = VALUES(total_classes_held)
            `;

            // Execute the insert query with actual values for each student
            await conn.execute(insertQuery, [rollNumber, studentName, attendedClasses, totalClasses]);
        }

        console.log(`Data inserted successfully for subject: ${subjectName}`);
    } catch (error) {
        console.error(`Error inserting data for ${subjectName}:`, error);
        throw error;
    } finally {
        if (conn) {
            conn.release(); // Release the connection back to the pool
        }
    }
}

// Function to process student data and calculate attendance counts
async function processStudentData(extractedData, subjectName) {
    //const lines = extractedData.split('\n'); // Split the data by lines
    extractedData = extractedData.replace(/0801[^0-9]/, '0801'); 
    const cleanedData = extractedData.replace(/\n/g, ' ');

    const lines = cleanedData.split(/(?=0801)/);

    const students = [];
    lines.forEach((line) => {
        console.log("Splitted Lines:", line);
    });

    // Iterate over each line of the extracted data
    lines.forEach((line) => {
        const cleanedLine = line.replace(/\t/g, '');
        // Use 0801 pattern to identify the start of a new student's record
        if (cleanedLine.includes('0801')) {
            // Extract roll number, name, and attendance data
            const parts = cleanedLine.split(/\s+/);
            const rollNumber = parts[0]; // Replace any variants like 080!, 080I, etc., with 0801
            const studentName = parts[1] + ' ' + parts[2]; // Combine first name and last name
            const attendanceData = parts.slice(3).join(' ').replace(/\s+/g, ' '); // Clean up extra spaces

            // Split attendance data into individual entries and process counts
            let attendedClasses = 0;
            let totalClasses = 0;
            const attendanceEntries = attendanceData.split(/\s+/); // Split on whitespace

            attendanceEntries.forEach((entry) => {
                // Handle multi-character entries like 'APP' or 'PPA'
                entry.split('').forEach((char) => {
                    if (char === 'P') {
                        attendedClasses++; // Count 'P' for attended classes
                        totalClasses++; // Count 'P' for total classes
                    } else if (char === 'A') {
                        totalClasses++; // Count 'A' for total classes
                    }
                });
            });

            // Log the student for debugging (optional)
            console.log(`Processing student: ${rollNumber} - ${studentName} | Attended: ${attendedClasses} | Total: ${totalClasses}`);

            // Insert the student's data into the students array (for eventual database insertion)
            students.push({
                rollNumber,
                studentName,
                attendedClasses,
                totalClasses,
            });
        }
    });

    // Create table if it doesn't exist
    await createTableForSubject(subjectName);

    // Insert the processed student data into the database (function already written)
    await insertStudentData(subjectName, students);

    return students; // Return the inserted student records
}

// Exporting the functions to use in other files
module.exports = {
    createTableForSubject,
    processStudentData,
    insertStudentData
};
