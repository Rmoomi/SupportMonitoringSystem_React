const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Helper to write activity log
async function logActivity(userId, action, ticketId, details) {
  try {
    const logData = {
      action: action,
      ticket_id: ticketId,
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

// 1. Archive a single ticket
router.post('/archive', async (req, res, next) => {
  const { ticket_id, archived_by, archive_reason } = req.body;

  if (!ticket_id || !archived_by) {
    return res.status(400).json({ error: true, message: 'ticket_id and archived_by are required.' });
  }

  try {
    // Fetch original ticket details
    const { data: ticket, error: fetchErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('ticket_id', ticket_id)
      .single();

    if (fetchErr) {
      if (fetchErr.code === 'PGRST116') {
        return res.status(404).json({
          error: true,
          message: `Ticket #${ticket_id} not found or database access denied. If Row Level Security (RLS) is enabled, ensure the backend has the SUPABASE_SERVICE_ROLE_KEY configured in .env.`
        });
      }
      throw fetchErr;
    }

    // Insert into tickets_archive
    const { error: archiveErr } = await supabase
      .from('tickets_archive')
      .insert([{
        ticket_id: ticket.ticket_id,
        company_id: ticket.company_id,
        technical_id: ticket.technical_id,
        product_id: ticket.product_id,
        concern_id: ticket.concern_id,
        concern_description: ticket.concern_description,
        date_requested: ticket.date_requested,
        assigned_date: ticket.assigned_date,
        submitted_date: ticket.submitted_date,
        finish_date: ticket.finish_date,
        solution: ticket.solution,
        remarks: ticket.remarks,
        priority: ticket.priority,
        status: ticket.status,
        assigned: ticket.assigned,
        is_viewed: ticket.is_viewed,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        archived_by: archived_by,
        archive_reason: archive_reason || 'Archived via system'
      }]);

    if (archiveErr) {
      throw new Error(`Failed to insert to archive: ${archiveErr.message}`);
    }

    // Delete from tickets table
    const { error: deleteErr } = await supabase
      .from('tickets')
      .delete()
      .eq('ticket_id', ticket_id);

    if (deleteErr) {
      throw new Error(`Failed to delete original ticket: ${deleteErr.message}`);
    }

    // Log action
    await logActivity(archived_by, 'ARCHIVE', ticket_id, `Archived ticket: ${archive_reason}`);

    return res.json({ success: true, message: `Ticket #${ticket_id} archived successfully.` });
  } catch (err) {
    next(err);
  }
});

// 2. Bulk operations on tickets
router.post('/bulk', async (req, res, next) => {
  const { ticket_ids, action, value, archived_by, archive_reason } = req.body;

  if (!ticket_ids || !Array.isArray(ticket_ids) || ticket_ids.length === 0) {
    return res.status(400).json({ error: true, message: 'ticket_ids array is required.' });
  }

  try {
    let resultMessage = '';

    if (action === 'assign') {
      // Set technician, status to 'In Progress', assigned to true, is_viewed to false
      const { error } = await supabase
        .from('tickets')
        .update({
          technical_id: value,
          status: 'In Progress',
          assigned: true,
          is_viewed: false,
          assigned_date: new Date().toISOString()
        })
        .in('ticket_id', ticket_ids);

      if (error) throw error;

      for (const tid of ticket_ids) {
        await logActivity(archived_by, 'ASSIGN', tid, `Bulk assigned to technician ID: ${value}`);
      }
      resultMessage = `Assigned ${ticket_ids.length} tickets successfully.`;

    } else if (action === 'status') {
      const updateObj = { status: value };
      if (value === 'Resolved' || value === 'Closed') {
        updateObj.finish_date = new Date().toISOString();
        if (req.body.solution) {
          updateObj.solution = req.body.solution;
        }
      }
      const { error } = await supabase
        .from('tickets')
        .update(updateObj)
        .in('ticket_id', ticket_ids);

      if (error) throw error;

      for (const tid of ticket_ids) {
        await logActivity(archived_by, 'UPDATE_STATUS', tid, `Bulk updated status to: ${value}`);
      }
      resultMessage = `Updated status of ${ticket_ids.length} tickets successfully.`;

    } else if (action === 'priority') {
      const { error } = await supabase
        .from('tickets')
        .update({ priority: value })
        .in('ticket_id', ticket_ids);

      if (error) throw error;

      for (const tid of ticket_ids) {
        await logActivity(archived_by, 'UPDATE_PRIORITY', tid, `Bulk updated priority to: ${value}`);
      }
      resultMessage = `Updated priority of ${ticket_ids.length} tickets successfully.`;

    } else if (action === 'archive') {
      if (!archived_by) {
        return res.status(400).json({ error: true, message: 'archived_by is required for archiving.' });
      }

      // Fetch all tickets to archive
      const { data: tickets, error: fetchErr } = await supabase
        .from('tickets')
        .select('*')
        .in('ticket_id', ticket_ids);

      if (fetchErr) throw fetchErr;

      const archiveRows = tickets.map(ticket => ({
        ticket_id: ticket.ticket_id,
        company_id: ticket.company_id,
        technical_id: ticket.technical_id,
        product_id: ticket.product_id,
        concern_id: ticket.concern_id,
        concern_description: ticket.concern_description,
        date_requested: ticket.date_requested,
        assigned_date: ticket.assigned_date,
        submitted_date: ticket.submitted_date,
        finish_date: ticket.finish_date,
        solution: ticket.solution,
        remarks: ticket.remarks,
        priority: ticket.priority,
        status: ticket.status,
        assigned: ticket.assigned,
        is_viewed: ticket.is_viewed,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        archived_by: archived_by,
        archive_reason: archive_reason || 'Bulk archived'
      }));

      // Insert all archive rows
      const { error: archiveErr } = await supabase
        .from('tickets_archive')
        .insert(archiveRows);

      if (archiveErr) throw archiveErr;

      // Delete from tickets
      const { error: deleteErr } = await supabase
        .from('tickets')
        .delete()
        .in('ticket_id', ticket_ids);

      if (deleteErr) throw deleteErr;

      for (const tid of ticket_ids) {
        await logActivity(archived_by, 'ARCHIVE', tid, `Bulk archived: ${archive_reason}`);
      }
      resultMessage = `Archived ${ticket_ids.length} tickets successfully.`;

    } else if (action === 'delete') {
      // Hard delete (not standard, but requested in bulk ops)
      const { error } = await supabase
        .from('tickets')
        .delete()
        .in('ticket_id', ticket_ids);

      if (error) throw error;

      for (const tid of ticket_ids) {
        await logActivity(archived_by, 'DELETE', tid, `Bulk hard deleted ticket.`);
      }
      resultMessage = `Permanently deleted ${ticket_ids.length} tickets.`;

    } else {
      return res.status(400).json({ error: true, message: `Unknown action: ${action}` });
    }

    return res.json({ success: true, message: resultMessage });
  } catch (err) {
    next(err);
  }
});

// 3. Excel Batch Import
router.post('/import', async (req, res, next) => {
  const { rows, duplicate_strategy, imported_by } = req.body;

  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: true, message: 'rows array is required.' });
  }

  // default strategy: 'merge' (which means create new if duplicate, i.e., allow duplicates)
  const strategy = duplicate_strategy || 'merge';

  try {
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      const {
        company_name,
        contact_person,
        contact_number,
        email,
        product_name,
        version,
        concern_name,
        concern_description,
        priority,
        status,
        date_requested,
        remarks,
        solution,
        technical_email // Optional: can specify technician email to auto-assign
      } = row;

      if (!company_name || !product_name || !concern_name) {
        skippedCount++;
        continue;
      }

      // Step A: Find or Create Client
      let clientId;
      const { data: clientData, error: clientFetchErr } = await supabase
        .from('clients')
        .select('client_id')
        .eq('company_name', company_name.trim())
        .maybeSingle();

      if (clientFetchErr) throw clientFetchErr;

      if (clientData) {
        clientId = clientData.client_id;
        // Optionally update client details if changed
        await supabase
          .from('clients')
          .update({
            contact_person: contact_person || 'N/A',
            contact_number: contact_number || '',
            email: email || ''
          })
          .eq('client_id', clientId);
      } else {
        const { data: newClient, error: clientInsertErr } = await supabase
          .from('clients')
          .insert([{
            company_name: company_name.trim(),
            contact_person: contact_person || 'N/A',
            contact_number: contact_number || '',
            email: email || ''
          }])
          .select('client_id')
          .single();

        if (clientInsertErr) throw clientInsertErr;
        clientId = newClient.client_id;
      }

      // Step B: Find or Create Product
      let productId;
      const { data: productData, error: productFetchErr } = await supabase
        .from('products')
        .select('product_id')
        .eq('product_name', product_name.trim())
        .maybeSingle();

      if (productFetchErr) throw productFetchErr;

      if (productData) {
        productId = productData.product_id;
      } else {
        const { data: newProduct, error: productInsertErr } = await supabase
          .from('products')
          .insert([{
            product_name: product_name.trim(),
            version: version || '1.0'
          }])
          .select('product_id')
          .single();

        if (productInsertErr) throw productInsertErr;
        productId = newProduct.product_id;
      }

      // Step C: Find or Create Concern
      let concernId;
      const { data: concernData, error: concernFetchErr } = await supabase
        .from('concerns')
        .select('concern_id')
        .eq('concern_name', concern_name.trim())
        .maybeSingle();

      if (concernFetchErr) throw concernFetchErr;

      if (concernData) {
        concernId = concernData.concern_id;
      } else {
        const { data: newConcern, error: concernInsertErr } = await supabase
          .from('concerns')
          .insert([{
            concern_name: concern_name.trim(),
            description: concern_description || concern_name
          }])
          .select('concern_id')
          .single();

        if (concernInsertErr) throw concernInsertErr;
        concernId = newConcern.concern_id;
      }

      // Step D: Find Technician by Email if specified
      let techId = null;
      if (technical_email) {
        const { data: techData } = await supabase
          .from('technical_staff')
          .select('technical_id')
          .eq('email', technical_email.trim())
          .maybeSingle();
        if (techData) {
          techId = techData.technical_id;
        }
      }

      // Step E: Duplicate Detection
      // A duplicate is a ticket with the same client, product, and concern that is not closed
      const { data: existingTickets, error: ticketFetchErr } = await supabase
        .from('tickets')
        .select('*')
        .eq('company_id', clientId)
        .eq('product_id', productId)
        .eq('concern_id', concernId)
        .not('status', 'eq', 'Closed');

      if (ticketFetchErr) throw ticketFetchErr;

      const hasDuplicate = existingTickets && existingTickets.length > 0;

      if (hasDuplicate && strategy === 'skip') {
        skippedCount++;
        continue;
      }

      if (hasDuplicate && strategy === 'overwrite') {
        const ticketToOverwrite = existingTickets[0]; // update the first active duplicate found
        const updates = {
          concern_description: concern_description || ticketToOverwrite.concern_description,
          priority: (priority || ticketToOverwrite.priority),
          status: (status || ticketToOverwrite.status),
          remarks: remarks || ticketToOverwrite.remarks,
          solution: solution || ticketToOverwrite.solution,
          updated_at: new Date().toISOString()
        };

        if (techId) {
          updates.technical_id = techId;
          updates.assigned = true;
          updates.assigned_date = new Date().toISOString();
        }

        const { error: updateErr } = await supabase
          .from('tickets')
          .update(updates)
          .eq('ticket_id', ticketToOverwrite.ticket_id);

        if (updateErr) throw updateErr;

        await logActivity(imported_by, 'UPDATE_STATUS', ticketToOverwrite.ticket_id, `Overwritten via Excel import`);
        updatedCount++;
      } else {
        // 'merge' or new ticket scenario: insert fresh row
        const newTicket = {
          company_id: clientId,
          product_id: productId,
          concern_id: concernId,
          concern_description: concern_description || 'Imported via Excel',
          priority: (priority || 'Medium'),
          status: (status || 'Pending'),
          remarks: remarks || '',
          solution: solution || '',
          date_requested: date_requested ? new Date(date_requested).toISOString() : new Date().toISOString(),
          assigned: techId ? true : false,
          technical_id: techId,
          assigned_date: techId ? new Date().toISOString() : null
        };

        const { data: insertedTicket, error: insertErr } = await supabase
          .from('tickets')
          .insert([newTicket])
          .select('ticket_id')
          .single();

        if (insertErr) throw insertErr;

        await logActivity(imported_by, 'CREATE', insertedTicket.ticket_id, `Created via Excel import`);
        createdCount++;
      }
    }

    return res.json({
      success: true,
      message: `Import complete. Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
