const db = require("../../../shared/db/mysql");

class StudentService {
  static async checkStudent(mobile) {
    try {
      const [rows] = await db.query(
        `SELECT * FROM tblstud_profile
         WHERE stud_mobile = ? AND current_status IN ('regular', 'x_regular')`,
        [mobile]
      );

      if (rows.length === 0) {
        return false;
      }

      return rows;
    } catch (error) {
      console.error('Error in Checking Student:', error);
      return false;
    }
  }
}

module.exports = StudentService;