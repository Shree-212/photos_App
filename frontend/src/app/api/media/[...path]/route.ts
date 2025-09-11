import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Get the authorization header
    const authorization = request.headers.get('authorization');
    
    if (!authorization) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 });
    }

    // Reconstruct the path - handle empty path for listing
    const path = params.path && params.path.length > 0 ? params.path.join('/') : '';
    const mediaServiceUrl = `http://media-service.task-manager.svc.cluster.local:80/media${path ? `/${path}` : ''}`;
    
    // Add query parameters if any
    const url = new URL(request.url);
    const searchParams = url.searchParams.toString();
    const finalUrl = searchParams ? `${mediaServiceUrl}?${searchParams}` : mediaServiceUrl;
    
    // Create a timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes
    
    try {
      const response = await fetch(finalUrl, {
        method: 'GET',
        headers: {
          'Authorization': authorization,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text();
        return new NextResponse(errorData, { status: response.status });
      }

      // For image/video content, stream the response
      const contentType = response.headers.get('content-type');
      
      if (contentType && (contentType.startsWith('image/') || contentType.startsWith('video/'))) {
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        
        return new NextResponse(response.body, {
          status: response.status,
          headers
        });
      }

      // For JSON responses
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
      
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout' }, 
          { status: 408 }
        );
      }
      
      throw fetchError;
    }
    
  } catch (error: any) {
    console.error('Media proxy error:', error);
    
    return NextResponse.json(
      { error: 'Media service error', details: error.message }, 
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Get the authorization header
    const authorization = request.headers.get('authorization');
    
    if (!authorization) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 });
    }

    // Reconstruct the path
    const path = params.path && params.path.length > 0 ? params.path.join('/') : '';
    
    if (!path) {
      return NextResponse.json({ error: 'Media ID is required' }, { status: 400 });
    }
    
    const mediaServiceUrl = `http://media-service.task-manager.svc.cluster.local:80/media/${path}`;
    
    // Create a timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds
    
    try {
      const response = await fetch(mediaServiceUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': authorization,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text();
        return new NextResponse(errorData, { status: response.status });
      }

      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
      
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Delete request timeout' }, 
          { status: 408 }
        );
      }
      
      throw fetchError;
    }
    
  } catch (error: any) {
    console.error('Media delete error:', error);
    
    return NextResponse.json(
      { error: 'Failed to delete media', details: error.message }, 
      { status: 500 }
    );
  }
}
