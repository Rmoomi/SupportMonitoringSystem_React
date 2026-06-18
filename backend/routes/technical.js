const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Helper to write activity log
async function logActivity(userId, action, details) {
  try {
    const logData = {
      action: action,
      details: details
    };
    if (userId && userId !== 'undefined') {
      logData.user_id = userId;
    }
    await supabase.from('activity_log').insert([logData]);
  } catch (err) {
    console.error('Error logging activity:', err);
  }
}

// 1. Toggle Technician Active Status (Enables/Disables login capacity)
router.put('/:id/toggle-active', async (req, res, next) => {
  const { id } = req.params;
  const { is_active, admin_id } = req.body;

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: true, message: 'is_active boolean is required.' });
  }

  try {
    const { data, error } = await supabase
      .from('technical_staff')
      .update({ is_active })
      .eq('technical_id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: true,
          message: 'Technician not found or database access denied. If Row Level Security (RLS) is enabled, ensure the backend has the SUPABASE_SERVICE_ROLE_KEY configured in .env.'
        });
      }
      throw error;
    }

    await logActivity(
      admin_id, 
      is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 
      `${is_active ? 'Activated' : 'Deactivated'} technician ID: ${id} (${data.firstname} ${data.lastname})`
    );

    return res.json({ 
      success: true, 
      message: `Technician ${data.firstname} ${data.lastname} is now ${is_active ? 'Active' : 'Inactive'}.`,
      data 
    });
  } catch (err) {
    next(err);
  }
});

// 2. Adjust Technician Privileges and Profile Details
router.put('/:id/privileges', async (req, res, next) => {
  const { id } = req.params;
  const { 
    can_view_tickets, 
    can_view_technical, 
    can_view_reports, 
    position, 
    branch,
    firstname,
    lastname,
    contact_viber,
    admin_id
  } = req.body;

  try {
    const updates = {};
    if (typeof can_view_tickets === 'boolean') updates.can_view_tickets = can_view_tickets;
    if (typeof can_view_technical === 'boolean') updates.can_view_technical = can_view_technical;
    if (typeof can_view_reports === 'boolean') updates.can_view_reports = can_view_reports;
    if (position) updates.position = position;
    if (branch) updates.branch = branch;
    if (firstname) updates.firstname = firstname;
    if (lastname) updates.lastname = lastname;
    if (contact_viber !== undefined) updates.contact_viber = contact_viber;

    const { data, error } = await supabase
      .from('technical_staff')
      .update(updates)
      .eq('technical_id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: true,
          message: 'Technician not found or database access denied. If Row Level Security (RLS) is enabled, ensure the backend has the SUPABASE_SERVICE_ROLE_KEY configured in .env.'
        });
      }
      throw error;
    }

    await logActivity(
      admin_id, 
      'UPDATE_USER_PRIVILEGES', 
      `Updated profile/privileges for technician ID: ${id} (${data.firstname} ${data.lastname})`
    );

    return res.json({ 
      success: true, 
      message: `Updated profile details for ${data.firstname} ${data.lastname} successfully.`,
      data 
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
