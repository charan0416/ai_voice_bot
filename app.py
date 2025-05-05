import os
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
import google.generativeai as genai
import json
import traceback # Import traceback for detailed error info

# Load environment variables from .env file
load_dotenv()

# Configure the Google Generative AI library
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    print("\n--- Configuration Error: GOOGLE_API_KEY not found in .env file ---")
    print("Please create a .env file in the same directory as app.py and add GOOGLE_API_KEY=YOUR_API_KEY_HERE\n")
    # Set flag to indicate initialization failure
    genai_initialized = False
else:
    try:
        genai.configure(api_key=GOOGLE_API_KEY)
        # Initialize the generative model
        # Use a model that supports function calling (e.g., gemini-1.5-flash or gemini-1.0-pro)
        # Check https://ai.google.dev/models/gemini for available models and their capabilities
        print(f"Attempting to initialize Gemini model...")
        model = genai.GenerativeModel(
            model_name='gemini-1.5-flash', # Or 'gemini-1.0-pro' - Adjust if needed based on your key access
            tools=[{
                "function_declarations": [
                    {
                        "name": "search_tool",
                        "description": "Searches the web for information. Use this for questions about current events, facts, or anything you don't know.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "query": {
                                    "type": "STRING",
                                    "description": "The search query."
                                }
                            },
                            "required": ["query"]
                        }
                    }
                ]
            }]
        )
        # Start a chat session with empty history initially
        # This object maintains the conversation state for the session
        chat = model.start_chat(history=[])
        genai_initialized = True
        print("Google Generative AI model initialized successfully.")
    except Exception as e:
        print(f"\n--- Google API Initialization Error: {e} ---")
        print("Please double-check your GOOGLE_API_KEY and ensure the model name ('gemini-1.5-flash') is correct and available to your key.\n")
        model = None
        chat = None
        genai_initialized = False


app = Flask(__name__)
# Explicitly set the static folder path relative to the current file's directory
# This is more robust than relying on the current working directory
app.static_folder = os.path.join(os.path.dirname(__file__), 'static')


# --- Define the simulated tool function ---
# This function MUST return a Python dictionary for the content of the 'response' field.
def search_tool(query):
    """
    This is a *simulated* search function.
    It returns a Python dictionary as the result content for the API response.
    """
    print(f"--- Simulated Tool Call: Agent requested search for: {query} ---")
    # Simulate search results - add more complex logic/data as needed
    simulated_results = {
        "weather in london": "It's currently cloudy with a chance of rain in London.",
        "capital of france": "The capital of France is Paris.",
        "current date": "The current date is May 2, 2025.",
        "who is the president of the united states": "The current president of the United States is Joe Biden (as of 2025).",
        "capital of india": "The capital of India is New Delhi.",
        "hi": "Hello!",
        "hello": "Hi there!",
        "what is artificial intelligence": "Artificial intelligence is a field focusing on creating intelligent agents, which perceive their environment and take actions to maximize success at goal achievement.",
        # Add more simulated results here for different queries
    }
    # Return a simulated result text
    result_text = simulated_results.get(query.lower(), f"Simulated search result for '{query}': Information found suggests...")
    print(f"--- Simulated Tool Result Text: {result_text} ---")
    # **FIX:** ALWAYS return the result text wrapped inside a Python dictionary.
    # The key name ("result" here) matches documentation examples.
    # This dictionary will be serialized into a Protobuf Struct for the API response's 'response' field.
    return {"result": result_text} # Use a key like 'result' for the text


# --- Dictionary mapping tool names (as strings) to actual Python functions ---
available_tools = {
    "search_tool": search_tool,
}

# --- Function to handle agent interaction including tool use ---
def agent_chat_response(user_input):
    # Check if Google AI model was initialized successfully on startup
    if not genai_initialized or model is None or chat is None:
        print("--- Chat Request Failed: Google AI model failed to initialize ---")
        return "Backend AI model failed to initialize. Check server logs for API key or model errors."

    # **FIX:** Initialize these variables to empty strings/lists OUTSIDE any conditional blocks
    final_text_to_return = ""
    initial_text_from_first_response = ""
    tool_results_for_api_list = [] # List to store the structure needed for the *second* API call (sending tool results back)
    final_text_from_second_response = "" # Variable to capture text from the *second* response


    try:
        print(f"--- Processing User Message: {user_input} ---")
        print(f"--- Sending message to Google Gemini API (First Call) ---")
        # Send user message to the model. This is the primary AI interaction point.
        # The response object might contain text, tool calls, or both.
        response = chat.send_message(user_input)
        print("--- Received response from Google Gemini API (First Call) ---")

        # --- Process the model's response for tool calls and initial text ---
        tool_calls_from_response = [] # Capture tool calls identified in the first response

        # Iterate through response parts to find text and function calls.
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
             for part in response.candidates[0].content.parts:
                 if part.function_call:
                     # If the part is a function call, add it to our list of calls to execute
                     tool_calls_from_response.append(part.function_call)
                     print(f"--- Model Identified Tool Call: {part.function_call.name} ---")
                 if part.text:
                     # If the part is text, capture it from the first response
                     initial_text_from_first_response += part.text # Concatenate text parts if there are multiple


        # --- If tool calls were requested by the model in the first response, execute them and structure results for sending back ---
        if tool_calls_from_response:
            print(f"--- Executing {len(tool_calls_from_response)} Requested Tool Call(s) from first response ---")

            for tool_call in tool_calls_from_response:
                function_name = tool_call.name # Get the name of the function to call
                function_args = tool_call.args # Get the arguments for the function call

                print(f"--- Attempting to execute tool: {function_name} with args: {function_args} ---")

                tool_result_content_dict = None # Initialize variable for tool's returned dictionary (the *content* for 'response' field)
                execution_error_message = None # Initialize error message string


                # Check if the requested tool name exists and is executable in our backend
                if function_name in available_tools:
                    try:
                        tool_function = available_tools[function_name]

                        # --- Execute the specific tool function based on name ---
                        if function_name == "search_tool":
                            # Validate and pass arguments expected by the search tool
                             if 'query' in function_args and isinstance(function_args['query'], str):
                                 # Call the search tool function - it *must* return a Python dictionary for its result
                                 raw_result = tool_function(function_args['query'])

                                 # **FIX:** Validate that the tool actually returned a dictionary as expected
                                 if isinstance(raw_result, dict):
                                      tool_result_content_dict = raw_result # Use the valid dictionary result (e.g., {"result": "..."})
                                      print(f"--- Tool '{function_name}' executed successfully, returned dictionary. ---")
                                 else:
                                      # Handle case where tool returned something unexpected (not a dict)
                                      execution_error_message = f"Tool '{function_name}' returned unexpected non-dict result type: {type(raw_result).__name__}. Value: {raw_result}"
                                      print(f"--- Tool Execution Warning: {execution_error_message} ---")

                             else:
                                 # Handle invalid or missing arguments for the search tool
                                 execution_error_message = f"Invalid arguments for tool '{function_name}'. Expected {{'query': 'string'}}. Received: {function_args}"
                                 print(f"--- Tool Execution Error: {execution_error_message} ---")

                        # Add logic here for other tools if you add them (copy the search_tool pattern)
                        # ... elif function_name == "another_tool": ...
                        #     ... call another tool function (which must return a dict) ...
                        #     ... store result in tool_execution_result_dict ...


                        # Handle the case where a known tool exists but no specific execution logic was written for it
                        # If after attempting execution, tool_execution_result_dict is still None AND there was no execution error logged
                        if tool_result_content_dict is None and execution_error_message is None:
                             # This could happen if a new tool is added to available_tools but the handling 'if' block is missing.
                             # **FIXED Syntax Error:** Ensuring this message construction is correct within the block.
                             execution_error_message = f"Internal error: No specific execution logic defined for known tool '{function_name}' or it failed to set a dictionary result/error message."
                             print(f"--- Internal Execution Logic Error: {execution_error_message} ---")


                    except Exception as e: # Catch *unexpected* exceptions during the Python tool function call itself
                        # This catches errors that shouldn't happen based on validation, but could (e.g., bug in tool fn).
                        execution_error_message = f"Exception during execution of tool '{function_name}': {type(e).__name__} - {e}"
                        tool_execution_result_dict = {"error": execution_error_message} # Report as error dictionary
                        print(f"--- Tool Execution Exception: {execution_error_message} ---")
                        traceback.print_exc() # Print exception traceback to server console

                else: # Handle case where the model requested a tool that is NOT defined in 'available_tools'
                     execution_error_message = f"Error: Model requested unknown tool: {function_name}"
                     tool_execution_result_dict = {"error": execution_error_message} # Report as error dictionary
                     print(f"--- Tool Request Error: {execution_error_message} ---")


                # --- Structure the final result dictionary for THIS tool call for the API list ---
                # This dictionary must represent a FunctionResponse Part
                # Structure: {"function_response": {"name": "tool_name", "response": dictionary_output}}
                # The value associated with the 'response' key *must* be a dictionary (or can be empty dict {} on error/no result).

                content_dict_for_api_response_field = {} # Default to empty dictionary

                # Use the determined content dictionary (successful result dict or error dict)
                if execution_error_message:
                    # If there was an execution error, put the error details into a dictionary for the API 'response' field
                    # The API expects a dictionary here for the Struct conversion.
                    content_dict_for_api_response_field = {"error": execution_error_message} # Report error details as a dictionary
                    print(f"--- Formatting Tool Error Result for API for tool '{function_name}' ---")
                elif tool_result_content_dict is not None and isinstance(tool_result_content_dict, dict):
                    # If execution was successful AND returned a valid dictionary, use it as the content for 'response'
                    # Ensure it's definitely a dictionary before using it.
                    content_dict_for_api_response_field = tool_result_content_dict # Use the tool's dictionary result
                    print(f"--- Formatting Tool Success Result for API for tool '{function_name}', sending result dictionary. ---")
                else:
                     # This block captures cases where tool was requested but we couldn't get a dictionary result or error.
                     # We still need to report *something* back. Report as an error dictionary.
                     problem_details = execution_error_message if execution_error_message else f"Tool '{function_name}' issue: Couldn't finalize dictionary result or error."
                     content_dict_for_api_response_field = {"error": problem_details} # Report the problem as a dictionary
                     print(f"--- Internal Error Structuring Tool Result for API for tool '{function_name}': {problem_details} ---")


                # Build the final dictionary structure for this single tool's output part for the API list
                api_formatted_output_part = {
                    "function_response": {
                        "name": function_name, # Use the function name requested by the model
                        "response": content_dict_for_api_response_field # **FIX:** Ensure this value is always a dictionary.
                    }
                }
                # Add this structured dictionary to the list that will be sent to the API
                tool_outputs_for_api_list.append(api_formatted_output_part)
                print(f"--- Added structured API output part for tool '{function_name}' to list ({'success' if 'result' in content_dict_for_api_response_field else 'error'}). ---")


            # --- After executing all tool calls and structuring outputs, send the list back to the model ---
            final_text_from_second_response = "" # Initialize before potential assignment

            # Only send the tool results back if the list of formatted outputs is not empty
            if tool_outputs_for_api_list:
                print(f"--- Sending {len(tool_outputs_for_api_list)} structured tool output part(s) list back to Google Gemini API for follow-up ---")
                # Send the LIST of structured tool output part dictionaries to the model.
                # The API processes these results and should generate a final text response.
                # The `send_message` method expecting a list of FunctionResponse-like dicts directly works here.
                response_after_tools = chat.send_message(tool_outputs_for_api_list) # <-- Send the LIST directly

                print("--- Received Follow-up response from Google Gemini API after tool results ---")

                # Extract the final text from this SECOND response (the turn after tool use)
                if response_after_tools.candidates and response_after_tools.candidates[0].content and response_after_tools.candidates[0].content.parts:
                    final_text_parts = [part.text for part in response_after_tools.candidates[0].content.parts if part.text]
                    final_text_from_second_response = "".join(final_text_parts)
                    print(f"--- Final text found in second response: {final_text_from_second_response} ---")
                else:
                     # Case where model responded after tool use but with no text parts in the second turn
                     print("--- Warning: Model responded after tool use but provided no text in second turn ---")
                     # final_text_from_second_response remains empty, which is handled below


        # --- Determine the final text to return based on the entire interaction flow ---
        # Prioritize text found in the second response (after tool use) if tools were called AND text was found there
        if final_text_from_second_response:
             final_text_to_return = final_text_from_second_response
             print("--- Using text from second response (after tool use) as final text ---")
        # If no text from the second response, but tools were called, check for specific fallback text (e.g. no follow-up response)
        elif tool_calls_from_response and not final_text_from_second_response:
                 # This means tool calls happened, but the second response didn't have text.
                 # This happens if the response_after_tools has no text parts. We should provide a fallback.
                 final_text_to_return = "AI processed the tool output but did not provide a text follow-up response."
                 print(f"--- No text in second response after tool use, providing fallback: {final_text_to_return} ---")

        # If NO tool calls were requested initially (OR if tool handling failed before sending second message list)
        # fall back to any initial text from the first response
        elif initial_text_from_first_response:
             final_text_to_return = initial_text_from_first_response
             print("--- No tool calls processed or outputs sent, using initial text from first response as final text ---")
        # If no text found in any step (first response, second response after tools), provide a default fallback
        else:
            # If no text extracted from either response part after checking both potential sources.
             print("--- No text response extracted from any part of the interaction flow. ---")
             final_text_to_return = "AI did not provide a text response." # Final fallback


    except Exception as e:
        # *** GENERIC UNEXPECTED ERROR HANDLING during the *overall* interaction flow ***
        # This catches errors that happen outside of specific API calls or tool execution blocks
        print(f"\n--- AN UNEXPECTED ERROR OCCURRED DURING AI INTERACTION FLOW ---")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Details: {e}")
        # Print the full traceback for detailed debugging in the server console
        traceback.print_exc()
        print("--------------------------------------------------------\n")
        # Return a more detailed error message to the frontend for debugging purposes
        # In a production application, you would return a generic message like "An internal server error occurred."
        final_text_to_return = f"An internal backend error occurred: {type(e).__name__} - {e}" # Provide specific error to frontend


    # --- Return the determined final text response to the frontend ---
    # This returns the value set by the logic in the try block (success text or error string)
    print(f"--- Returning final response to frontend: {final_text_to_return} ---")
    return final_text_to_return


# --- Flask Routes ---

# Route to serve the main index.html file at the root URL ('/')
@app.route('/')
def index():
    # Construct the full path to index.html using the determined static folder
    index_path = os.path.join(app.static_folder, 'index.html')
    # Check if the file exists before attempting to serve it
    if os.path.exists(index_path):
        # send_from_directory is safe and correctly handles file serving from a specified directory
        return send_from_directory(app.static_folder, 'index.html')
    else:
        # If index.html is not found, return a 404 error with a helpful message
        print(f"Error: index.html not found at {index_path}")
        return f"Error: Frontend file (index.html) not found. Please ensure the 'static' directory exists next to app.py and contains index.html, style.css, and script.js.", 404


# Flask automatically serves other files from the 'static' folder at the /static/ URL path.
# E.g., a request to /static/style.css will automatically look for static/style.css
# So, a separate route like @app.route('/static/<path:filename>') is usually not needed
# when using the default static_folder setup.

# Route to handle chat messages from the frontend via POST requests
@app.route('/chat', methods=['POST'])
def chat_endpoint():
    # Ensure the incoming request data is in JSON format
    if not request.is_json:
        print("--- Chat Request Error: Request is not JSON ---")
        return jsonify({"response": "Request must be JSON"}), 415 # 415 Unsupported Media Type

    # Get the JSON data from the request body
    data = request.get_json()
    # Extract the 'message' field from the JSON data
    user_message = data.get('message')

    # Validate that the 'message' field exists and is a non-empty string
    if not user_message or not isinstance(user_message, str) or not user_message.strip():
        print("--- Chat Request Error: Invalid or empty message received ---")
        return jsonify({"response": "Invalid or empty message provided."}), 400 # 400 Bad Request

    # Process the user message using the agentic AI logic
    ai_response = agent_chat_response(user_message)

    # Return the AI's response as a JSON object
    return jsonify({"response": ai_response})

# --- Run the Flask app ---
# This block only runs when the script is executed directly (not imported)
if __name__ == '__main__':
    # Optional: Check if the static directory exists on startup and provide a warning
    # This check is mainly for providing an early warning if the structure is wrong.
    static_dir_path = os.path.join(os.path.dirname(__file__), 'static')
    if not os.path.exists(static_dir_path):
       print(f"--- Warning: Static directory not found at {static_dir_path}. Ensure it exists and contains index.html, style.css, script.js. ---")
    elif not os.path.exists(os.path.join(static_dir_path, 'index.html')):
        print(f"--- Warning: index.html not found inside the static directory at {static_dir_path}. Ensure it exists. ---")


    print("Starting Flask server...")
    # Run the Flask development server.
    # debug=True enables debug mode (auto-reloads on code changes, provides debugger)
    # debug=True should ALWAYS be False in production for security and performance.
    # port specifies the port number to listen on (default is 5000).
    # host='127.0.0.1' makes it accessible only from your computer.
    # host='0.0.0.0' makes it accessible externally (DANGER: DO NOT USE IN PRODUCTION WITHOUT A PROPER WEB SERVER SETUP).
    app.run(debug=True, port=8000, host='127.0.0.1') # Defaulting to 8000. CHANGE THIS PORT if it's in use.