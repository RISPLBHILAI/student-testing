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

  // Current college / course / branch / semester for a set of students
  // (same source as the admin search). Returns Map<id, info>; missing rows
  // are simply absent. Never throws — profile pickers must still work.
  static async getAcademicInfo(ids) {
    const map = new Map();
    if (!ids || !ids.length) return map;
    try {
      const [rows] = await db.query(
        `SELECT
            cs.stud_id,
            c.short_name   AS clg_name,
            cor.cor_name,
            b.branch_sub_name,
            sy.short_name  AS sem_name
         FROM stud_current_sem_year cs
         LEFT JOIN tblcollege        c   ON c.id   = cs.clg_id
         LEFT JOIN tblcourse         cor ON cor.id = cs.cor_id
         LEFT JOIN tblbranch_subject b   ON b.id   = cs.branch_id
         LEFT JOIN tbsem_year        sy  ON sy.id  = cs.sem_year_id
         WHERE cs.stud_id IN (?)`,
        [ids]
      );
      for (const r of rows) {
        if (map.has(r.stud_id)) continue;
        map.set(r.stud_id, {
          college: r.clg_name || null,
          course: r.cor_name || null,
          branch: r.branch_sub_name || null,
          year: r.sem_name || null,
        });
      }
    } catch (error) {
      console.error('Error fetching academic info:', error);
    }
    return map;
  }

  // Shape used by the app's "Select Student Profile" list
  static async toProfileList(records, mobile) {
    const info = await StudentService.getAcademicInfo(records.map((s) => s.id));
    return records.map((s) => {
      const a = info.get(s.id) || {};
      return {
        id: s.id,
        name: s.stud_name,
        profile: s.stud_profile_pic,
        rollNumber: s.stud_roll_no,
        universityRollNo: s.university_roll_no || null,
        enrollNumber: s.stud_enroll_no,
        fatherName: s.stud_fathername || null,
        esslid: s.essl_id,
        college: a.college || null,
        course: a.course || s.cor_name || null,
        branch: a.branch || null,
        year: a.year || null,
        mobile,
        registered: true,
      };
    });
  }
}

module.exports = StudentService;
