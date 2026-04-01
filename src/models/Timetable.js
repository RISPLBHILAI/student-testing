const db = require("../../../shared/db/mysql");

class Timetable {
  
  // Get student's current semester details
  static async getStudentSemesterDetails(studentId) {
    const [rows] = await db.query(
      'SELECT stud_id, clg_id, cor_id, branch_id, sem_year_id FROM stud_current_sem_year WHERE stud_id = ? LIMIT 1',
      [studentId]
    );
    return rows[0] || null;
  }

  // Get regular timetable for a specific date
  static async getRegularTimetable(lectureDate, clg_id, cor_id, branch_id, sem_year_id) {
    const query = `
      SELECT
        naac_time_table_datewise_log.lecture_no,
        naac_time_table_datewise_log.time_from,
        naac_time_table_datewise_log.time_to,
        naac_time_table_datewise_log.college_name,
        naac_time_table_datewise_log.course,
        naac_time_table_datewise_log.department,
        naac_time_table_datewise_log.semester,
        naac_time_table_datewise_log.subject_type,
        naac_time_table_datewise_log.subject_id,
        naac_time_table_datewise_log.subject_name,
        naac_time_table_datewise_log.group_name,
        tblcollege.short_name AS clg_name,
        tblcourse.cor_name,
        tblbranch_subject.branch_sub_name,
        tbsem_year.short_name AS sem_year_name,
        'Regular' AS lecture_type_name 
      FROM
        naac_time_table_datewise_log,
        tblcollege,
        tblbranch_subject,
        tblcourse,
        tbsem_year
      WHERE
        tblcollege.id = naac_time_table_datewise_log.college_name 
        AND tblbranch_subject.id = naac_time_table_datewise_log.department 
        AND tblcourse.id = naac_time_table_datewise_log.course 
        AND tbsem_year.id = naac_time_table_datewise_log.semester 
        AND naac_time_table_datewise_log.lecture_date = ?
        AND naac_time_table_datewise_log.college_name = ?
        AND naac_time_table_datewise_log.course = ?
        AND naac_time_table_datewise_log.department = ?
        AND naac_time_table_datewise_log.semester = ?
      ORDER BY
        naac_time_table_datewise_log.lecture_no ASC,
        naac_time_table_datewise_log.semester ASC`;

    const [rows] = await db.query(query, [
      lectureDate, clg_id, cor_id, branch_id, sem_year_id
    ]);
    return rows;
  }

  // Get engagement lectures for a specific date
  static async getEngagementTimetable(lectureDate, day, clg_id, cor_id, branch_id, sem_year_id) {
    const query = `
      SELECT
        lectureEngagement.lectureno AS lecture_no,
        lectureEngagement.time_from,
        lectureEngagement.time_to,
        lectureEngagement.lectureofempid,
        lectureEngagement.clgid AS college_name,
        lectureEngagement.corid AS course,
        lectureEngagement.branchid AS department,
        lectureEngagement.semid AS semester,
        subject_allotment.subject_type,
        lectureEngagement.engagedsubjectid AS subject_id,
        subject_allotment.subject_name,
        naac_time_table.group_name,
        tblcollege.short_name AS clg_name,
        tblcourse.cor_name,
        tblbranch_subject.branch_sub_name,
        'Engagement' AS lecture_type_name
      FROM
        lectureEngagement,
        subject_allotment,
        tblcollege,
        tblbranch_subject,
        tblcourse,
        naac_time_table
      WHERE
        tblcollege.id = lectureEngagement.clgid 
        AND tblbranch_subject.id = lectureEngagement.branchid 
        AND tblcourse.id = lectureEngagement.corid  
        AND lectureEngagement.lecturedate = ?
        AND lectureEngagement.engagedsubjectid = subject_allotment.id 
        AND naac_time_table.faculty_id = lectureEngagement.lectureofempid 
        AND naac_time_table.day = ?
        AND naac_time_table.college_name = lectureEngagement.clgid 
        AND naac_time_table.course = lectureEngagement.corid 
        AND naac_time_table.department = lectureEngagement.branchid 
        AND naac_time_table.semester = lectureEngagement.semid 
        AND naac_time_table.session = lectureEngagement.sessionid 
        AND naac_time_table.time_from = lectureEngagement.time_from 
        AND naac_time_table.time_to = naac_time_table.time_to 
        AND lectureEngagement.clgid = ?
        AND lectureEngagement.corid = ?
        AND lectureEngagement.branchid = ?
        AND lectureEngagement.semid = ?
      ORDER BY
        lectureEngagement.lectureno ASC`;

    const [rows] = await db.query(query, [
      lectureDate, day, clg_id, cor_id, branch_id, sem_year_id
    ]);
    return rows;
  }

  // Get timetable for a specific date
  static async getTimetableForDate(studentId, date) {
    // Get student semester details
    const semesterDetails = await this.getStudentSemesterDetails(studentId);
    if (!semesterDetails) {
      throw new Error('Student semester information not found');
    }

    const { clg_id, cor_id, branch_id, sem_year_id } = semesterDetails;
    
    // Get day name from date
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[new Date(date).getDay()];

    // Get regular timetable
    const regularTimetable = await this.getRegularTimetable(date, clg_id, cor_id, branch_id, sem_year_id);
    
    // Get engagement timetable  
    const engagementTimetable = await this.getEngagementTimetable(date, day, clg_id, cor_id, branch_id, sem_year_id);
    
    // Combine and sort
    const combined = [...regularTimetable, ...engagementTimetable];
    combined.sort((a, b) => {
      if (a.lecture_no !== b.lecture_no) {
        return parseInt(a.lecture_no) - parseInt(b.lecture_no);
      }
      return a.time_from.localeCompare(b.time_from);
    });

    return {
      date,
      day,
      timetable: combined,
      semesterDetails
    };
  }

  // Get timetable for today
  static async getTodayTimetable(studentId) {
    const today = new Date().toISOString().split('T')[0];
    return await this.getTimetableForDate(studentId, today);
  }

  // Get timetable for the week (Monday to Friday)
  static async getWeekTimetable(studentId, startDate = null) {
    // If no start date provided, use current week
    const currentDate = startDate ? new Date(startDate) : new Date();
    
    // Get Monday of the current week
    const dayOfWeek = currentDate.getDay();
    const diff = currentDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // adjust when day is Sunday
    const monday = new Date(currentDate.setDate(diff));
    
    const weekTimetable = [];
    
    // Get timetable for each day of the week (Monday to Friday)
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateString = date.toISOString().split('T')[0];
      
      try {
        const dayTimetable = await this.getTimetableForDate(studentId, dateString);
        weekTimetable.push(dayTimetable);
      } catch (error) {
        // If no timetable for a day, add empty day
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        weekTimetable.push({
          date: dateString,
          day: dayNames[date.getDay()],
          timetable: [],
          semesterDetails: null
        });
      }
    }
    
    return weekTimetable;
  }

  // Get timetable for a specific week range
  static async getWeekTimetableByDateRange(studentId, startDate, endDate) {
    const weekTimetable = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateString = date.toISOString().split('T')[0];
      
      try {
        const dayTimetable = await this.getTimetableForDate(studentId, dateString);
        weekTimetable.push(dayTimetable);
      } catch (error) {
        // If no timetable for a day, add empty day
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        weekTimetable.push({
          date: dateString,
          day: dayNames[date.getDay()],
          timetable: [],
          semesterDetails: null
        });
      }
    }
    
    return weekTimetable;
  }

  // Format timetable data for response
  static formatTimetableData(timetableData) {
    return timetableData.map(lecture => ({
      lectureNo: lecture.lecture_no,
      timeFrom: lecture.time_from,
      timeTo: lecture.time_to,
      subjectName: lecture.subject_name,
      subjectType: lecture.subject_type,
      groupName: lecture.group_name,
      lectureType: lecture.lecture_type_name,
      collegeName: lecture.clg_name,
      courseName: lecture.cor_name,
      branchName: lecture.branch_sub_name,
      semesterName: lecture.sem_year_name || lecture.semester
    }));
  }

  // Get week boundaries (Monday to Friday) for a given date
  static getWeekBoundaries(date = null) {
    const currentDate = date ? new Date(date) : new Date();
    
    // Get Monday of the current week
    const dayOfWeek = currentDate.getDay();
    const diff = currentDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(currentDate.setDate(diff));
    
    // Get Friday of the current week
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    
    return {
      startDate: monday.toISOString().split('T')[0],
      endDate: friday.toISOString().split('T')[0]
    };
  }
}

module.exports = Timetable;