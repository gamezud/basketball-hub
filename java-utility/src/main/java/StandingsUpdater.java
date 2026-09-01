import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

public class StandingsUpdater {
  public static void main(String[] args) throws Exception {
    String url = System.getenv("DATABASE_URL");
    if (url == null) {
      System.err.println("Set DATABASE_URL env for Java job.");
      return;
    }
    try (Connection c = DriverManager.getConnection(url)) {
      c.setAutoCommit(false);
      try (Statement s = c.createStatement()) {
        s.execute("TRUNCATE standings");
        s.execute("INSERT INTO standings(team_id) SELECT id FROM teams");
      }
      try (Statement s = c.createStatement();
           ResultSet rs = s.executeQuery(
             "SELECT home_team_id, away_team_id, home_score, away_score FROM matches WHERE status='finished'")) {
        while (rs.next()) {
          int h = rs.getInt(1), a = rs.getInt(2), hs = rs.getInt(3), as = rs.getInt(4);
          int win = (hs > as) ? h : a, lose = (hs > as) ? a : h;
          int wpf = Math.max(hs, as), wpa = Math.min(hs, as);
          int lpf = wpa, lpa = wpf;

          try (PreparedStatement ps = c.prepareStatement(
            "UPDATE standings SET games_played=games_played+1,wins=wins+1,points_for=points_for+?,points_against=points_against+? WHERE team_id=?")) {
            ps.setInt(1, wpf); ps.setInt(2, wpa); ps.setInt(3, win); ps.executeUpdate();
          }
          try (PreparedStatement ps = c.prepareStatement(
            "UPDATE standings SET games_played=games_played+1,losses=losses+1,points_for=points_for+?,points_against=points_against+? WHERE team_id=?")) {
            ps.setInt(1, lpf); ps.setInt(2, lpa); ps.setInt(3, lose); ps.executeUpdate();
          }
        }
      }
      try (Statement s = c.createStatement()) {
        s.execute("UPDATE standings SET win_pct = CASE WHEN games_played=0 THEN 0 ELSE ROUND(wins::numeric/games_played,3) END");
      }
      c.commit();
      System.out.println("Standings updated.");
    }
  }
}
