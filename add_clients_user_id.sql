-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO UPDATE THE SCHEMA FOR CLIENT AUTHENTICATION

-- 1. Add user_id column to clients table referencing auth.users(id) if not exists
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Update the handles signup trigger function to support 'Client' roles
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_firstname VARCHAR;
    v_lastname VARCHAR;
    v_position VARCHAR;
    v_branch VARCHAR;
    v_is_active BOOLEAN;
    v_role VARCHAR;
    v_company_name VARCHAR;
BEGIN
    -- Extract role from metadata, default to 'Technical' if not set
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'Technical');
    
    IF v_role = 'Client' THEN
        -- Link or insert into public.clients table
        v_company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', 'Company ' || NEW.id);
        
        INSERT INTO public.clients (user_id, company_name, contact_person, contact_number, email)
        VALUES (
            NEW.id,
            v_company_name,
            COALESCE(NEW.raw_user_meta_data->>'firstname', '') || ' ' || COALESCE(NEW.raw_user_meta_data->>'lastname', ''),
            NEW.raw_user_meta_data->>'contact_number',
            NEW.email
        )
        ON CONFLICT (company_name) DO UPDATE 
        SET user_id = EXCLUDED.user_id, 
            email = EXCLUDED.email,
            contact_person = EXCLUDED.contact_person,
            contact_number = EXCLUDED.contact_number;
            
        RETURN NEW;
    END IF;

    -- Otherwise, register as technical staff
    v_firstname := COALESCE(NEW.raw_user_meta_data->>'firstname', 'New');
    v_lastname := COALESCE(NEW.raw_user_meta_data->>'lastname', 'Staff');
    v_position := COALESCE(NEW.raw_user_meta_data->>'position', 'Technical');
    v_branch := COALESCE(NEW.raw_user_meta_data->>'branch', 'DAVAO');
    
    -- If registering with passcode 'Admin2026', automatically activate and make Admin
    IF NEW.raw_user_meta_data->>'admin_passcode' = 'Admin2026' THEN
        v_is_active := true;
        v_position := 'Admin';
    ELSE
        v_is_active := false;
    END IF;

    INSERT INTO public.technical_staff (
        user_id, firstname, lastname, email, branch, position, is_active,
        can_view_tickets, can_view_technical, can_view_reports
    )
    VALUES (
        NEW.id, v_firstname, v_lastname, NEW.email, v_branch, v_position, v_is_active,
        true, true, true
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
